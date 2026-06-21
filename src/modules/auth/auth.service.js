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

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * A partir de un usuario ya cargado desde BD (con sus roles y permisos
 * anidados), construye el payload exacto que va dentro del JWT.
 *
 * Este payload es el contrato que auth.middleware.js, tenant.middleware.js
 * y permission.middleware.js ya asumen — no modificar sin actualizar
 * también esos tres archivos:
 *   { usuarioId, empresaId, roles, permisos, esGlobal }
 *
 * `roles` lleva los nombres de los roles para mostrarlos en el frontend
 * (ej. "Administrador de Empresa") pero NO se usa para decisiones de
 * autorización en el backend — eso lo hace `permisos` exclusivamente.
 *
 * `permisos` es una lista plana y deduplicada de claves (ej. "agentes.ver",
 * "tickets.crear") resuelta desde todos los roles del usuario. Es lo que
 * permission.middleware.js revisa con req.user.permisos.includes(clave).
 */
const construirPayloadJWT = (usuario) => {
  const roles = usuario.usuario_roles.map((ur) => ({
    id: ur.catalogo_roles.id,
    nombre: ur.catalogo_roles.nombre,
    esGlobal: ur.catalogo_roles.es_global,
  }))

  // Aplanar todos los permisos de todos los roles, sin duplicados
  const permisosSet = new Set()
  usuario.usuario_roles.forEach((ur) => {
    ur.catalogo_roles.roles_permisos.forEach((rp) => {
      permisosSet.add(rp.permisos.clave)
    })
  })

  const esGlobal = roles.some((r) => r.esGlobal === true)

  return {
    usuarioId: usuario.id,
    empresaId: usuario.empresa_id, // null para el Super Admin
    roles,
    permisos: Array.from(permisosSet),
    esGlobal,
  }
}

/**
 * Calcula la fecha de expiración del refresh token como objeto Date.
 * Se guarda en sesiones.fecha_expiracion para saber cuándo caducó
 * una sesión sin necesidad de decodificar el token.
 * JWT_REFRESH_EXPIRES_IN viene como string '7d', '30d', etc.
 */
const calcularFechaExpiracionRefresh = () => {
  const raw = env.JWT_REFRESH_EXPIRES_IN // ej. '7d'
  const match = raw.match(/^(\d+)([dhms])$/)
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // fallback 7 días

  const valor = parseInt(match[1])
  const unidad = match[2]
  const ms = { d: 86400000, h: 3600000, m: 60000, s: 1000 }[unidad]
  return new Date(Date.now() + valor * ms)
}

// ─── Casos de uso ─────────────────────────────────────────────────────────────

/**
 * Busca empresas activas cuyo nombre contenga el texto buscado.
 * Usado por el autocomplete del formulario de login.
 * No hay lógica de negocio adicional — solo delega al repository.
 */
const buscarEmpresasLogin = (texto) => {
  if (!texto || texto.trim().length < 2) return []
  return authRepository.buscarEmpresasPorNombre(texto.trim())
}

/**
 * Login principal.
 *
 * Flujo:
 * 1. Si viene empresaId (usuario normal): buscar por usuario + empresa
 *    Si NO viene empresaId (Super Admin): buscar por usuario global (empresa_id = NULL)
 * 2. Validar que el usuario exista y no esté eliminado
 * 3. Validar que el estado sea 'Activo' — Prisma no lo valida solo
 * 4. Comparar contraseña con bcrypt
 * 5. Construir el payload del JWT con roles y permisos resueltos
 * 6. Generar access token (8h) + refresh token (7d)
 * 7. Guardar hash del refresh token en sesiones
 *    (el trigger tr_desactivar_sesiones_anteriores ya cierra las sesiones
 *    anteriores a nivel de BD — no necesitamos hacerlo manualmente)
 * 8. Actualizar ultimo_acceso del usuario
 *
 * IMPORTANTE sobre el error genérico:
 * Si el usuario no existe O la contraseña es incorrecta, respondemos con
 * el mismo mensaje — no le decimos al atacante cuál de los dos falló.
 */
const login = async ({ usuario, password, empresaId }, ip, dispositivo) => {
  // Paso 1: buscar usuario según si viene empresaId o no
  let usuarioDB
  if (empresaId) {
    usuarioDB = await authRepository.buscarPorUsuarioYEmpresa(usuario, empresaId)
  } else {
    // Solo el Super Admin puede loguearse sin seleccionar empresa
    usuarioDB = await authRepository.buscarPorUsuarioGlobal(usuario)
  }

  // Pasos 2 + 4: mensaje genérico en ambos casos (usuario no existe o contraseña incorrecta)
  const ERROR_GENERICO = new UnauthorizedError('Usuario o contraseña incorrectos')

  if (!usuarioDB) throw ERROR_GENERICO

  // Paso 3: validar estado del usuario — debe ser 'Activo'
  const estadoNombre = usuarioDB.catalogo_estado_usuario?.nombre
  if (estadoNombre !== 'Activo') {
    // Mensaje más específico solo cuando el usuario sí existe pero está bloqueado/suspendido
    // para que el administrador pueda entender por qué no puede entrar
    throw new AppError(
      `Cuenta ${estadoNombre?.toLowerCase() || 'inactiva'}. Contacta al administrador.`,
      403
    )
  }

  // Paso 4: comparar contraseña
  const passwordValida = await comparePassword(password, usuarioDB.password_hash)
  if (!passwordValida) throw ERROR_GENERICO

  // Paso 5: construir payload del JWT
  const payload = construirPayloadJWT(usuarioDB)

  // Paso 6: generar tokens
  const accessToken = generarAccessToken(payload)
  const refreshToken = generarRefreshToken(usuarioDB.id)

  // Paso 7: guardar hash del refresh en sesiones
  const tokenHash = hashRefreshToken(refreshToken)
  await authRepository.crearSesion({
    usuarioId: usuarioDB.id,
    tokenHash,
    ip,
    dispositivo,
    fechaExpiracion: calcularFechaExpiracionRefresh(),
  })

  // Paso 8: actualizar ultimo_acceso (fire and forget — no bloquea la respuesta)
  authRepository.actualizarUltimoAcceso(usuarioDB.id).catch((err) => {
    console.error('[auth.service] Error actualizando ultimo_acceso:', err.message)
  })

  return {
    accessToken,
    refreshToken,
    usuario: {
      usuarioId: usuarioDB.id,
      nombre: usuarioDB.nombre,
      empresaId: usuarioDB.empresa_id,
      esGlobal: payload.esGlobal,
      roles: payload.roles,
    },
  }
}

/**
 * Renueva el access token a partir de un refresh token válido.
 *
 * Flujo:
 * 1. Verificar firma del refresh token (JWT_REFRESH_SECRET)
 * 2. Buscar la sesión activa por el hash del token recibido
 *    — si no existe, el token fue revocado (logout o nueva sesión lo desplazó)
 * 3. Verificar que la sesión no haya expirado
 * 4. Recargar el usuario con sus roles/permisos actuales desde BD
 *    — importante: los permisos pueden haber cambiado desde el último login
 * 5. Generar un nuevo access token con datos frescos
 *    — NO rotamos el refresh token aquí para mantener la sesión simple;
 *      si se quiere rotación de refresh token, es un cambio de decisión
 *      que impacta en el cliente también
 */
const refresh = async (refreshToken) => {
  // Paso 1
  let decoded
  try {
    decoded = verificarRefreshToken(refreshToken)
  } catch {
    throw new UnauthorizedError('Refresh token inválido o expirado')
  }

  // Paso 2
  const tokenHash = hashRefreshToken(refreshToken)
  const sesion = await authRepository.buscarSesionPorTokenHash(tokenHash)
  if (!sesion) throw new UnauthorizedError('Sesión revocada o inválida')

  // Paso 3
  if (sesion.fecha_expiracion && sesion.fecha_expiracion < new Date()) {
    await authRepository.desactivarSesion(sesion.id)
    throw new UnauthorizedError('Sesión expirada')
  }

  // Paso 4: recargar usuario con roles/permisos frescos
  const usuarioDB = await authRepository.buscarPorIdConRoles(decoded.usuarioId)
  if (!usuarioDB || usuarioDB.deleted_at) {
    throw new UnauthorizedError('Usuario no encontrado o desactivado')
  }

  if (usuarioDB.catalogo_estado_usuario?.nombre !== 'Activo') {
    throw new UnauthorizedError('Cuenta inactiva')
  }

  // Paso 5
  const payload = construirPayloadJWT(usuarioDB)
  const nuevoAccessToken = generarAccessToken(payload)

  return { accessToken: nuevoAccessToken }
}

/**
 * Logout: desactiva la sesión activa del usuario identificada por
 * el refresh token. El access token sigue siendo técnicamente válido
 * hasta que expire (8h), pero auth.middleware.js ya rechaza cualquier
 * request si no hay sesión activa en BD — así que el efecto es inmediato.
 */
const logout = async (refreshToken) => {
  if (!refreshToken) return // nada que hacer

  const tokenHash = hashRefreshToken(refreshToken)
  const sesion = await authRepository.buscarSesionPorTokenHash(tokenHash)
  if (!sesion) return // ya estaba cerrada, no es error

  await authRepository.desactivarSesion(sesion.id)
}

module.exports = {
  buscarEmpresasLogin,
  login,
  refresh,
  logout,
}