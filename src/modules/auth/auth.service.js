'use strict'

const authRepository = require('./auth.repository')
const { comparePassword } = require('../../core/utils/password.util')
const {
  generarAccessToken,
  generarRefreshToken,
  verificarRefreshToken,
  hashRefreshToken,
} = require('../../core/utils/token.util')
const { UnauthorizedError } = require('../../core/errors/AuthError')
const AppError = require('../../core/errors/AppError')
const env = require('../../config/env')

const MAX_INTENTOS = 5

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Construye el payload del JWT.
 * Contrato que auth.middleware, tenant.middleware y permission.middleware asumen:
 *   { usuarioId, empresaId, sucursalId, roles, permisos, esGlobal }
 *
 * sucursalId: null = Admin General (ve toda la empresa)
 *             UUID = Admin de Sucursal (scoping automático en repositories)
 */
const construirPayloadJWT = (usuario) => {
  const roles = usuario.usuario_roles.map((ur) => ({
    id:       ur.catalogo_roles.id,
    nombre:   ur.catalogo_roles.nombre,
    esGlobal: ur.catalogo_roles.es_global,
  }))

  const permisosSet = new Set()
  usuario.usuario_roles.forEach((ur) => {
    ur.catalogo_roles.roles_permisos.forEach((rp) => {
      permisosSet.add(rp.permisos.clave)
    })
  })

  const esGlobal = roles.some((r) => r.esGlobal === true)

  return {
    usuarioId:  usuario.id,
    empresaId:  usuario.empresa_id,
    sucursalId: usuario.sucursal_id || null,
    roles,
    permisos: Array.from(permisosSet),
    esGlobal,
  }
}

/**
 * Calcula la fecha de expiración del refresh token como objeto Date.
 * JWT_REFRESH_EXPIRES_IN viene como string '7d', '30d', etc.
 */
const calcularFechaExpiracionRefresh = () => {
  const raw   = env.JWT_REFRESH_EXPIRES_IN
  const match = raw.match(/^(\d+)([dhms])$/)
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const valor  = parseInt(match[1])
  const unidad = match[2]
  const ms     = { d: 86400000, h: 3600000, m: 60000, s: 1000 }[unidad]
  return new Date(Date.now() + valor * ms)
}

// ─── Casos de uso ─────────────────────────────────────────────────────────────

/**
 * Login principal.
 *
 * Flujo:
 * 1. Validar empresa por codigoAcceso (o path de Super Admin sin código)
 * 2. Buscar usuario dentro de esa empresa
 * 3. Verificar bloqueo por intentos fallidos (lazy eval, sin cron)
 *    — Un usuario bloqueado NO puede entrar aunque la contraseña sea correcta
 *    — El tiempo restante se recalcula en cada intento
 * 4. Validar estado del usuario (debe ser 'Activo')
 * 5. Comparar contraseña
 *    — Si falla: registrar intento y mostrar restantes antes del bloqueo
 *    — Si pasa: limpiar intentos y emitir tokens
 * 6. Construir payload JWT con sucursalId incluido
 */
const login = async ({ usuario, password, codigoAcceso }, ip, dispositivo) => {
  let usuarioDB
  let empresaId = null

  if (codigoAcceso) {
    const empresa = await authRepository.buscarEmpresaPorCodigo(codigoAcceso)
    // Código inválido — error genérico sin revelar si la empresa existe
    if (!empresa) throw new UnauthorizedError('Datos incorrectos.')

    empresaId = empresa.id
    usuarioDB = await authRepository.buscarPorUsuarioYEmpresa(usuario, empresaId)
  } else {
    // Super Admin — sin empresa, sin código. Solo acceso directo por API.
    usuarioDB = await authRepository.buscarPorUsuarioGlobal(usuario)
  }

  // Usuario no encontrado — mismo mensaje genérico para no revelar si existe
  if (!usuarioDB) throw new UnauthorizedError('Datos incorrectos.')

  // ── Verificar bloqueo ANTES de validar la contraseña ──────────────────────
  // Un usuario bloqueado no puede entrar aunque sus credenciales sean correctas.
  // El tiempo restante se recalcula en cada intento (lazy eval, sin cron).
  if (empresaId) {
    const intentosActuales = await authRepository.contarIntentosFallidos(usuarioDB.id)

    if (intentosActuales >= MAX_INTENTOS) {
      const minutos = await authRepository.minutosRestantesBloqueo(usuarioDB.id)
      const tiempoMsg = minutos > 0
        ? `Intenta de nuevo en ${minutos} minuto(s)`
        : 'Intenta de nuevo en un momento'
      throw new AppError(
        `Cuenta bloqueada por múltiples intentos fallidos. ${tiempoMsg} o contacta al administrador.`,
        403
      )
    }
  }

  // ── Validar estado del usuario ─────────────────────────────────────────────
  const estadoNombre = usuarioDB.catalogo_estado_usuario?.nombre
  if (estadoNombre !== 'Activo') {
    throw new AppError(
      `Cuenta ${estadoNombre?.toLowerCase() || 'inactiva'}. Contacta al administrador.`,
      403
    )
  }

  // ── Comparar contraseña ────────────────────────────────────────────────────
  const passwordValida = await comparePassword(password, usuarioDB.password_hash)

  if (!passwordValida) {
    if (empresaId) {
      // Registrar el intento fallido
      await authRepository.registrarIntento(usuarioDB.id, empresaId, ip)

      // Contar los intentos DESPUÉS de registrar para tener el número actualizado
      const intentosTras = await authRepository.contarIntentosFallidos(usuarioDB.id)
      const restantes    = Math.max(0, MAX_INTENTOS - intentosTras)

      // Si con este intento se completan los 5, bloquear de inmediato
      if (restantes === 0) {
        throw new AppError(
          'Cuenta bloqueada por múltiples intentos fallidos. ' +
          'Intenta de nuevo en 15 minutos o contacta al administrador.',
          403
        )
      }

      // Mostrar cuántos intentos quedan antes del bloqueo
      throw new UnauthorizedError(
        `Datos incorrectos. Intentos restantes antes del bloqueo: ${restantes}.`
      )
    }
    // Super Admin: mensaje genérico sin conteo de intentos
    throw new UnauthorizedError('Datos incorrectos.')
  }

  // ── Credenciales correctas ─────────────────────────────────────────────────
  // Limpiar historial de intentos para que el contador vuelva a cero
  if (empresaId) await authRepository.limpiarIntentos(usuarioDB.id)

  const payload      = construirPayloadJWT(usuarioDB)
  const accessToken  = generarAccessToken(payload)
  const refreshToken = generarRefreshToken(usuarioDB.id)

  const tokenHash = hashRefreshToken(refreshToken)
  await authRepository.crearSesion({
    usuarioId:       usuarioDB.id,
    tokenHash,
    ip,
    dispositivo,
    fechaExpiracion: calcularFechaExpiracionRefresh(),
  })

  // Fire and forget — no bloquea la respuesta
  authRepository.actualizarUltimoAcceso(usuarioDB.id).catch((err) => {
    console.error('[auth.service] Error actualizando ultimo_acceso:', err.message)
  })

  return {
    accessToken,
    refreshToken,
    usuario: {
      usuarioId:  usuarioDB.id,
      nombre:     usuarioDB.nombre,
      empresaId:  usuarioDB.empresa_id,
      sucursalId: usuarioDB.sucursal_id || null,
      esGlobal:   payload.esGlobal,
      roles:      payload.roles,
    },
  }
}

/**
 * Renueva el access token con un refresh token válido.
 * Recarga roles/permisos frescos desde BD — pueden haber cambiado desde el login.
 * NO rota el refresh token (el cliente conserva el mismo hasta que expire).
 */
const refresh = async (refreshToken) => {
  let decoded
  try {
    decoded = verificarRefreshToken(refreshToken)
  } catch {
    throw new UnauthorizedError('Refresh token inválido o expirado.')
  }

  const tokenHash = hashRefreshToken(refreshToken)
  const sesion    = await authRepository.buscarSesionPorTokenHash(tokenHash)
  if (!sesion) throw new UnauthorizedError('Sesión revocada o inválida.')

  if (sesion.fecha_expiracion && sesion.fecha_expiracion < new Date()) {
    await authRepository.desactivarSesion(sesion.id)
    throw new UnauthorizedError('Sesión expirada.')
  }

  const usuarioDB = await authRepository.buscarPorIdConRoles(decoded.usuarioId)
  if (!usuarioDB || usuarioDB.deleted_at) {
    throw new UnauthorizedError('Usuario no encontrado o desactivado.')
  }

  if (usuarioDB.catalogo_estado_usuario?.nombre !== 'Activo') {
    throw new UnauthorizedError('Cuenta inactiva.')
  }

  const payload          = construirPayloadJWT(usuarioDB)
  const nuevoAccessToken = generarAccessToken(payload)

  return { accessToken: nuevoAccessToken }
}

/**
 * Logout: marca la sesión como inactiva.
 * El access token expira solo (8h), pero auth.middleware rechaza
 * cualquier request sin sesión activa — efecto inmediato.
 */
const logout = async (refreshToken) => {
  if (!refreshToken) return

  const tokenHash = hashRefreshToken(refreshToken)
  const sesion    = await authRepository.buscarSesionPorTokenHash(tokenHash)
  if (!sesion) return // ya estaba cerrada — no es error

  await authRepository.desactivarSesion(sesion.id)
}

module.exports = { login, refresh, logout }