const prisma = require('../../config/database')

/**
 * Lista todos los usuarios activos de una empresa.
 * Incluye su estado y roles para mostrarlo en la tabla del frontend.
 * Soporta filtro opcional por nombre de usuario (búsqueda).
 */
const listar = ({ empresaId, busqueda }) => {
  return prisma.usuarios.findMany({
    where: {
      empresa_id: empresaId,
      deleted_at: null,
      ...(busqueda
        ? {
            OR: [
              { nombre: { contains: busqueda, mode: 'insensitive' } },
              { usuario: { contains: busqueda, mode: 'insensitive' } },
              { correo: { contains: busqueda, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      nombre: true,
      usuario: true,
      correo: true,
      ultimo_acceso: true,
      fecha_registro: true,
      catalogo_estado_usuario: { select: { id: true, nombre: true } },
      usuario_roles: {
        select: {
          catalogo_roles: { select: { id: true, nombre: true } },
        },
      },
    },
    orderBy: { fecha_registro: 'desc' },
  })
}

/**
 * Busca un usuario por ID dentro de una empresa específica.
 * Incluye roles y permisos completos.
 */
const buscarPorId = ({ usuarioId, empresaId }) => {
  return prisma.usuarios.findFirst({
    where: { id: usuarioId, empresa_id: empresaId, deleted_at: null },
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
 * Verifica si ya existe un usuario activo con ese `usuario` o `correo`
 * dentro de la misma empresa — para dar un mensaje de error específico
 * antes de que Prisma falle con P2002 genérico.
 */
const existeDuplicado = ({ empresaId, usuario, correo, excluirId = null }) => {
  return prisma.usuarios.findFirst({
    where: {
      empresa_id: empresaId,
      deleted_at: null,
      ...(excluirId ? { id: { not: excluirId } } : {}),
      OR: [{ usuario }, { correo }],
    },
    select: { id: true, usuario: true, correo: true },
  })
}

const crear = ({
  empresaId,
  nombre,
  usuario,
  correo,
  passwordHash,
  estadoUsuarioId,
}) => {
  return prisma.usuarios.create({
    data: {
      empresa_id: empresaId,
      nombre,
      usuario,
      correo,
      password_hash: passwordHash,
      estado_usuario_id: estadoUsuarioId,
    },
    select: {
      id: true,
      nombre: true,
      usuario: true,
      correo: true,
      fecha_registro: true,
      catalogo_estado_usuario: { select: { id: true, nombre: true } },
    },
  })
}

const editar = ({ usuarioId, datos }) => {
  return prisma.usuarios.update({
    where: { id: usuarioId },
    data: datos,
    select: {
      id: true,
      nombre: true,
      usuario: true,
      correo: true,
      catalogo_estado_usuario: { select: { id: true, nombre: true } },
    },
  })
}

/**
 * Soft delete — nunca borra la fila, solo marca deleted_at.
 * Las sesiones activas del usuario quedarán inválidas en el
 * siguiente request porque auth.middleware.js verifica sesión activa,
 * y las sesiones tienen ON DELETE CASCADE en usuarios, pero como
 * es soft delete (no eliminamos la fila), hay que desactivarlas a mano.
 */
const eliminar = ({ usuarioId }) => {
  return prisma.$transaction([
    // Desactivar sesiones activas del usuario
    prisma.sesiones.updateMany({
      where: { usuario_id: usuarioId, activo: true },
      data: { activo: false },
    }),
    // Soft delete del usuario
    prisma.usuarios.update({
      where: { id: usuarioId },
      data: { deleted_at: new Date() },
    }),
  ])
}

/**
 * Obtiene el id del estado 'Activo' del catálogo.
 * Se usa al crear un usuario nuevo — el estado inicial siempre es Activo.
 */
const obtenerEstadoActivo = () => {
  return prisma.catalogo_estado_usuario.findFirst({
    where: { nombre: 'Activo', deleted_at: null },
    select: { id: true },
  })
}

/**
 * Reemplaza todos los roles de un usuario por los nuevos indicados.
 * Usa una transacción para que no quede el usuario sin roles si algo falla.
 */
const reemplazarRoles = ({ usuarioId, rolesIds }) => {
  return prisma.$transaction([
    prisma.usuario_roles.deleteMany({ where: { usuario_id: usuarioId } }),
    prisma.usuario_roles.createMany({
      data: rolesIds.map((rolId) => ({
        usuario_id: usuarioId,
        rol_id: rolId,
      })),
    }),
  ])
}

module.exports = {
  listar,
  buscarPorId,
  existeDuplicado,
  crear,
  editar,
  eliminar,
  obtenerEstadoActivo,
  reemplazarRoles,
}