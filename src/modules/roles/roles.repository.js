const prisma = require('../../config/database')

/**
 * Lista todos los roles de una empresa (no globales).
 * Incluye cuántos usuarios tienen cada rol y sus permisos.
 */
const listar = ({ empresaId }) => {
  return prisma.catalogo_roles.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    include: {
      _count: { select: { usuario_roles: true } },
      roles_permisos: {
        include: { permisos: { select: { id: true, clave: true, nombre: true, modulo: true } } },
      },
    },
    orderBy: { fecha_registro: 'asc' },
  })
}

const buscarPorId = ({ rolId, empresaId }) => {
  return prisma.catalogo_roles.findFirst({
    where: { id: rolId, empresa_id: empresaId, deleted_at: null },
    include: {
      _count: { select: { usuario_roles: true } },
      roles_permisos: {
        include: { permisos: { select: { id: true, clave: true, nombre: true, modulo: true } } },
      },
    },
  })
}

const existeDuplicado = ({ empresaId, nombre, excluirId = null }) => {
  return prisma.catalogo_roles.findFirst({
    where: {
      empresa_id: empresaId,
      nombre,
      deleted_at: null,
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    select: { id: true },
  })
}

const crear = ({ empresaId, nombre, descripcion }) => {
  return prisma.catalogo_roles.create({
    data: {
      empresa_id: empresaId,
      nombre,
      descripcion: descripcion || null,
      es_global: false,
    },
    select: { id: true, nombre: true, descripcion: true, fecha_registro: true },
  })
}

const editar = ({ rolId, datos }) => {
  return prisma.catalogo_roles.update({
    where: { id: rolId },
    data: datos,
    select: { id: true, nombre: true, descripcion: true },
  })
}

const eliminar = ({ rolId }) => {
  return prisma.catalogo_roles.update({
    where: { id: rolId },
    data: { deleted_at: new Date() },
  })
}

/**
 * Reemplaza los permisos de un rol por los nuevos indicados.
 * Usa transacción para que no quede el rol sin permisos si algo falla.
 */
const reemplazarPermisos = ({ rolId, permisosIds }) => {
  return prisma.$transaction([
    prisma.roles_permisos.deleteMany({ where: { rol_id: rolId } }),
    prisma.roles_permisos.createMany({
      data: permisosIds.map((permisoId) => ({
        rol_id: rolId,
        permiso_id: permisoId,
      })),
    }),
  ])
}

/**
 * Verifica cuántos usuarios activos tienen este rol asignado.
 * Se usa antes de eliminar un rol para avisar si hay usuarios afectados.
 */
const contarUsuariosConRol = ({ rolId }) => {
  return prisma.usuario_roles.count({ where: { rol_id: rolId } })
}

/**
 * Verifica que los IDs de roles dados pertenezcan a la empresa indicada.
 * Usada por usuarios.service al asignar roles a un usuario.
 */
const verificarRolesDeLaEmpresa = ({ empresaId, rolesIds }) => {
  return prisma.catalogo_roles.findMany({
    where: { id: { in: rolesIds }, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  })
}

module.exports = {
  listar,
  buscarPorId,
  existeDuplicado,
  crear,
  editar,
  eliminar,
  reemplazarPermisos,
  contarUsuariosConRol,
  verificarRolesDeLaEmpresa,
}