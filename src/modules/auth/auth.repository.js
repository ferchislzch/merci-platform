const prisma = require('../../config/database')
/**
 * Busca empresas activas cuyo nombre_comercial contenga el texto buscado.
 * Usado por el autocomplete del formulario de login — endpoint público,
 * solo devuelve id y nombre_comercial, nada más.
 * La búsqueda es case-insensitive gracias al tipo CITEXT de la columna
 * correo, pero nombre_comercial es VARCHAR, así que usamos mode: 'insensitive'
 * de Prisma para el mismo efecto.
 */
const buscarEmpresasPorNombre = (texto) => {
  return prisma.empresas.findMany({
    where: {
      nombre_comercial: { contains: texto, mode: 'insensitive' },
      status: 'activo',
      deleted_at: null,
    },
    select: { id: true, nombre_comercial: true },
    orderBy: { nombre_comercial: 'asc' },
    take: 10, // máximo 10 resultados para el dropdown
  })
}

/**
 * Busca un usuario activo (no soft-deleted) por su campo `usuario` dentro
 * de una empresa específica. Con el empresaId ya resuelto por el autocomplete
 * del login, esta búsqueda es exacta y sin posibilidad de ambigüedad.
 * Trae también su estado, roles y permisos resueltos en una sola query
 * porque el payload del JWT necesita esa información completa de entrada.
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
 * Busca un usuario activo por su campo `usuario` SIN filtrar por empresa.
 * Necesario exclusivamente para el Super Admin (empresa_id = NULL en BD),
 * que no pertenece a ninguna empresa y por lo tanto no puede seleccionar
 * una en el autocomplete del login.
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
 * Usado en el refresh para recargar roles/permisos actualizados
 * sin depender del payload del token viejo.
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

/**
 * Crea una sesión nueva con el hash del refresh token.
 * fecha_expiracion debe coincidir con la expiración real del refresh
 * token, no del access token (ver token.util.js).
 */
const crearSesion = ({ usuarioId, tokenHash, ip, dispositivo, fechaExpiracion }) => {
  return prisma.sesiones.create({
    data: {
      usuario_id: usuarioId,
      token_hash: tokenHash,
      ip: ip || null,
      dispositivo: dispositivo || null,
      activo: true,
      fecha_expiracion: fechaExpiracion,
    },
  })
}

/**
 * Busca una sesión activa por el hash del refresh token.
 * Se usa en el endpoint de refresh para confirmar que ese refresh
 * token no fue revocado (logout, nueva sesión que lo desplazó, etc.)
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
    data: { activo: false },
  })
}

/**
 * Desactiva TODAS las sesiones activas de un usuario excepto, opcionalmente,
 * una que se quiera conservar (la que se acaba de crear en este login).
 *
 * NOTA: el documento de diseño exige "una sola sesión activa por usuario".
 * auth.middleware.js menciona un trigger `tr_desactivar_sesiones_anteriores`
 * que se encarga de esto a nivel de base de datos. Como ese trigger ya
 * existe en el entorno real (confirmado fuera de este script SQL), esta
 * función queda como reserva explícita por si en algún momento se necesita
 * forzar la desactivación desde el código (ej. un endpoint de "cerrar
 * sesión en todos los dispositivos") — no porque el login dependa de
 * llamarla para que la regla de una sola sesión se cumpla.
 */
const desactivarSesionesAnteriores = (usuarioId, sesionIdConservar = null) => {
  return prisma.sesiones.updateMany({
    where: {
      usuario_id: usuarioId,
      activo: true,
      ...(sesionIdConservar ? { id: { not: sesionIdConservar } } : {}),
    },
    data: { activo: false },
  })
}

const actualizarUltimoAcceso = (usuarioId) => {
  return prisma.usuarios.update({
    where: { id: usuarioId },
    data: { ultimo_acceso: new Date() },
  })
}

module.exports = {
  buscarEmpresasPorNombre,
  buscarPorUsuarioYEmpresa,
  buscarPorUsuarioGlobal,
  buscarPorId,
  buscarPorIdConRoles,
  crearSesion,
  buscarSesionPorTokenHash,
  desactivarSesion,
  desactivarSesionesAnteriores,
  actualizarUltimoAcceso,
}