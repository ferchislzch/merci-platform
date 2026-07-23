const prisma = require('../../config/database')

/**
 * Lista todos los permisos del sistema agrupados por módulo.
 * El catálogo de permisos es global — no está filtrado por empresa.
 * Solo el Super Admin puede agregar nuevos permisos (via SQL directo).
 */
const listarTodos = () => {
  return prisma.permisos.findMany({
    where: { deleted_at: null },
    select: { id: true, clave: true, nombre: true, descripcion: true, modulo: true },
    orderBy: [{ modulo: 'asc' }, { clave: 'asc' }],
  })
}

/**
 * Verifica que los IDs de permisos dados existen en el catálogo.
 * Usada por roles.service antes de asignar permisos a un rol.
 */
const verificarPermisos = ({ permisosIds }) => {
  return prisma.permisos.findMany({
    where: { id: { in: permisosIds }, deleted_at: null },
    // `clave` se agrega para que roles.service.asignarPermisos pueda comparar
    // contra los permisos del usuario (anti-escalación) sin una segunda consulta.
    select: { id: true, clave: true },
  })
}

module.exports = { listarTodos, verificarPermisos }