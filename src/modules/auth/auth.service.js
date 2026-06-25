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
    usuarioId: usuario.id,
    empresaId: usuario.empresa_id,
    roles,
    permisos: Array.from(permisosSet),
    esGlobal,
  }
}

const calcularFechaExpiracionRefresh = () => {
  const raw   = env.JWT_REFRESH_EXPIRES_IN
  const match = raw.match(/^(\d+)([dhms])$/)
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const valor  = parseInt(match[1])
  const unidad = match[2]
  const ms     = { d: 86400000, h: 3600000, m: 60000, s: 1000 }[unidad]
  return new Date(Date.now() + valor * ms)
}

const login = async ({ usuario, password, codigoAcceso }, ip, dispositivo) => {
  let usuarioDB
  let empresaId = null

  if (codigoAcceso) {
    const empresa = await authRepository.buscarEmpresaPorCodigo(codigoAcceso)

    // Código inválido — error genérico, sin tocar BD ni revelar detalles
    if (!empresa) {
      throw new UnauthorizedError('Datos incorrectos.')
    }

    empresaId = empresa.id
    usuarioDB = await authRepository.buscarPorUsuarioYEmpresa(usuario, empresaId)
  } else {
    // Super Admin — sin empresa, sin código
    usuarioDB = await authRepository.buscarPorUsuarioGlobal(usuario)
  }

  if (!usuarioDB) throw new UnauthorizedError('Datos incorrectos.')

  // Verificar bloqueo — lazy eval, sin cron
  if (empresaId) {
    const intentosActuales = await authRepository.contarIntentosFallidos(usuarioDB.id)
    if (intentosActuales >= MAX_INTENTOS) {
      const minutos = await authRepository.minutosRestantesBloqueo(usuarioDB.id)
      throw new AppError(
        `Cuenta bloqueada por múltiples intentos fallidos. ` +
        `Intenta de nuevo en ${minutos} minuto(s) o contacta al administrador.`,
        403
      )
    }
  }

  // Validar estado
  const estadoNombre = usuarioDB.catalogo_estado_usuario?.nombre
  if (estadoNombre !== 'Activo') {
    throw new AppError(
      `Cuenta ${estadoNombre?.toLowerCase() || 'inactiva'}. Contacta al administrador.`,
      403
    )
  }

  // Comparar contraseña
  const passwordValida = await comparePassword(password, usuarioDB.password_hash)

  if (!passwordValida) {
    if (empresaId) {
      await authRepository.registrarIntento(usuarioDB.id, empresaId, ip)
      const intentosTras = await authRepository.contarIntentosFallidos(usuarioDB.id)
      const restantes    = Math.max(0, MAX_INTENTOS - intentosTras)
      if (restantes === 0) {
        throw new AppError(
          'Cuenta bloqueada por múltiples intentos fallidos. ' +
          'Intenta de nuevo en 15 minutos o contacta al administrador.',
          403
        )
      }
      throw new UnauthorizedError(
        `Datos incorrectos. Intentos restantes antes del bloqueo: ${restantes}.`
      )
    }
    throw new UnauthorizedError('Datos incorrectos.')
  }

  // Credenciales correctas — limpiar intentos previos
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

  authRepository.actualizarUltimoAcceso(usuarioDB.id).catch((err) => {
    console.error('[auth.service] Error actualizando ultimo_acceso:', err.message)
  })

  return {
    accessToken,
    refreshToken,
    usuario: {
      usuarioId: usuarioDB.id,
      nombre:    usuarioDB.nombre,
      empresaId: usuarioDB.empresa_id,
      esGlobal:  payload.esGlobal,
      roles:     payload.roles,
    },
  }
}

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

const logout = async (refreshToken) => {
  if (!refreshToken) return

  const tokenHash = hashRefreshToken(refreshToken)
  const sesion    = await authRepository.buscarSesionPorTokenHash(tokenHash)
  if (!sesion) return

  await authRepository.desactivarSesion(sesion.id)
}

module.exports = { login, refresh, logout }