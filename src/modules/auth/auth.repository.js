'use strict'

const prisma = require('../../config/database')

const MAX_INTENTOS = 5
const VENTANA_MS   = 15 * 60 * 1000 // 15 min en ms

// ─── empresa ──────────────────────────────────────────────────────────────────

/**
 * Busca una empresa activa por su código de acceso único.
 * Reemplaza buscarEmpresasPorNombre — ya no hay autocomplete público.
 */
const buscarEmpresaPorCodigo = (codigoAcceso) => {
  return prisma.empresas.findFirst({
    where: {
      codigo_acceso: codigoAcceso,
      status:        'activo',
      deleted_at:    null,
    },
    select: { id: true, nombre_comercial: true },
  })
}

// ─── usuario ──────────────────────────────────────────────────────────────────

/**
 * Busca un usuario activo por `usuario` dentro de una empresa.
 * Trae roles y permisos resueltos en una sola query para el payload JWT.
 * CAMPO CORRECTO: `usuario` (no nombre_usuario) — así está en la tabla.
 * RELACIONES CORRECTAS: usuario_roles → catalogo_roles → roles_permisos → permisos
 */
const buscarPorUsuarioYEmpresa = (usuario, empresaId) => {
  return prisma.usuarios.findFirst({
    where: { usuario, empresa_id: empresaId, deleted_at: null },
    include: {
      catalogo_estado_usuario: true,
      usuario_roles: {
        include: {
          catalogo_roles: {
            include: {
              roles_permisos: { include: { permisos: true } },
            },
          },
        },
      },
    },
  })
}

/**
 * Busca usuario SIN empresa — exclusivo para Super Admin (empresa_id = NULL).
 * No usa codigoAcceso porque el Super Admin no pertenece a ninguna empresa.
 */
const buscarPorUsuarioGlobal = (usuario) => {
  return prisma.usuarios.findFirst({
    where: { usuario, empresa_id: null, deleted_at: null },
    include: {
      catalogo_estado_usuario: true,
      usuario_roles: {
        include: {
          catalogo_roles: {
            include: {
              roles_permisos: { include: { permisos: true } },
            },
          },
        },
      },
    },
  })
}

const buscarPorId = (usuarioId) => {
  return prisma.usuarios.findUnique({ where: { id: usuarioId } })
}

/**
 * Igual que buscarPorUsuarioYEmpresa pero por ID.
 * Usado en el refresh para recargar roles/permisos actualizados desde BD.
 */
const buscarPorIdConRoles = (usuarioId) => {
  return prisma.usuarios.findUnique({
    where: { id: usuarioId },
    include: {
      catalogo_estado_usuario: true,
      usuario_roles: {
        include: {
          catalogo_roles: {
            include: {
              roles_permisos: { include: { permisos: true } },
            },
          },
        },
      },
    },
  })
}

// ─── intentos de login ────────────────────────────────────────────────────────

/**
 * Cuenta intentos fallidos del usuario dentro de la ventana de 15 min.
 */
const contarIntentosFallidos = (usuarioId) => {
  const desde = new Date(Date.now() - VENTANA_MS)
  return prisma.intentos_login.count({
    where: {
      usuario_id: usuarioId,
      fecha:      { gte: desde },
    },
  })
}

/**
 * Calcula minutos restantes del bloqueo activo.
 * El bloqueo expira 15 min después del primer intento de la ventana.
 */
const minutosRestantesBloqueo = async (usuarioId) => {
  const desde    = new Date(Date.now() - VENTANA_MS)
  const intentos = await prisma.intentos_login.findMany({
    where: {
      usuario_id: usuarioId,
      fecha:      { gte: desde },
    },
    orderBy: { fecha: 'asc' },
    take: MAX_INTENTOS,
  })

  if (intentos.length < MAX_INTENTOS) return 0

  const expira     = new Date(intentos[0].fecha.getTime() + VENTANA_MS)
  const restanteMs = expira.getTime() - Date.now()
  return restanteMs > 0 ? Math.ceil(restanteMs / 60_000) : 0
}

const registrarIntento = (usuarioId, empresaId, ip) => {
  return prisma.intentos_login.create({
    data: {
      usuario_id: usuarioId,
      empresa_id: empresaId,
      ip:         ip ?? null,
    },
  })
}

const limpiarIntentos = (usuarioId) => {
  return prisma.intentos_login.deleteMany({
    where: { usuario_id: usuarioId },
  })
}

// ─── sesiones ─────────────────────────────────────────────────────────────────

/**
 * Crea sesión con hash del refresh token.
 * NOTA: sesiones NO tiene empresa_id en el schema — solo usuario_id + metadata.
 * Campo correcto: `dispositivo` (no user_agent).
 */
const crearSesion = ({ usuarioId, tokenHash, ip, dispositivo, fechaExpiracion }) => {
  return prisma.sesiones.create({
    data: {
      usuario_id:       usuarioId,
      token_hash:       tokenHash,
      ip:               ip || null,
      dispositivo:      dispositivo || null,
      activo:           true,
      fecha_expiracion: fechaExpiracion,
    },
  })
}

/**
 * Busca sesión activa por hash del refresh token.
 * Filtra por activo: true — un logout ya la marca como false.
 */
const buscarSesionPorTokenHash = (tokenHash) => {
  return prisma.sesiones.findFirst({
    where: { token_hash: tokenHash, activo: true },
  })
}

/**
 * Desactiva una sesión específica (logout normal).
 */
const desactivarSesion = (sesionId) => {
  return prisma.sesiones.update({
    where: { id: sesionId },
    data:  { activo: false },
  })
}

/**
 * Desactiva TODAS las sesiones activas de un usuario, salvo una opcional.
 * Reserva para "cerrar sesión en todos los dispositivos".
 * El trigger tr_desactivar_sesiones_anteriores ya lo hace en BD al crear sesión.
 */
const desactivarSesionesAnteriores = (usuarioId, sesionIdConservar = null) => {
  return prisma.sesiones.updateMany({
    where: {
      usuario_id: usuarioId,
      activo:     true,
      ...(sesionIdConservar ? { id: { not: sesionIdConservar } } : {}),
    },
    data: { activo: false },
  })
}

const actualizarUltimoAcceso = (usuarioId) => {
  return prisma.usuarios.update({
    where: { id: usuarioId },
    data:  { ultimo_acceso: new Date() },
  })
}



module.exports = {
  buscarEmpresaPorCodigo,
  buscarPorUsuarioYEmpresa,
  buscarPorUsuarioGlobal,
  buscarPorId,
  buscarPorIdConRoles,
  contarIntentosFallidos,
  minutosRestantesBloqueo,
  registrarIntento,
  limpiarIntentos,
  crearSesion,
  buscarSesionPorTokenHash,
  desactivarSesion,
  desactivarSesionesAnteriores,
  actualizarUltimoAcceso,
}