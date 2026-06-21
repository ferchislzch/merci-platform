const rolesRepository = require('./roles.repository')
const permisosRepository = require('./permisos.repository')
const { NotFoundError } = require('../../core/errors/NotFoundError')
const AppError = require('../../core/errors/AppError')
const audit = require('../../services/audit.service')

// ─── Helper ───────────────────────────────────────────────────────────────────

const formatearRol = (rol) => ({
  rolId: rol.id,
  nombre: rol.nombre,
  descripcion: rol.descripcion,
  totalUsuarios: rol._count?.usuario_roles ?? 0,
  permisos: (rol.roles_permisos || []).map((rp) => ({
    permisoId: rp.permisos.id,
    clave: rp.permisos.clave,
    nombre: rp.permisos.nombre,
    modulo: rp.permisos.modulo,
  })),
  fechaRegistro: rol.fecha_registro,
})

// ─── Casos de uso ─────────────────────────────────────────────────────────────

const listar = async ({ empresaId }) => {
  const roles = await rolesRepository.listar({ empresaId })
  return roles.map(formatearRol)
}

const obtenerPorId = async ({ rolId, empresaId }) => {
  const rol = await rolesRepository.buscarPorId({ rolId, empresaId })
  if (!rol) throw new NotFoundError('Rol')
  return formatearRol(rol)
}

const crear = async ({ empresaId, nombre, descripcion }, { usuarioId, ip }) => {
  if (!nombre) throw new AppError('El nombre del rol es requerido', 400)

  const duplicado = await rolesRepository.existeDuplicado({ empresaId, nombre })
  if (duplicado) throw new AppError('Ya existe un rol con ese nombre en esta empresa', 409)

  const rol = await rolesRepository.crear({ empresaId, nombre, descripcion })

  await audit.log({
    usuarioId,
    empresaId,
    ip,
    modulo: 'roles',
    accion: 'INSERT',
    tabla: 'catalogo_roles',
    registroId: rol.id,
    datosNuevos: { nombre, descripcion },
  })

  return { rolId: rol.id, nombre: rol.nombre, descripcion: rol.descripcion }
}

const editar = async ({ rolId, empresaId, nombre, descripcion }, { usuarioId, ip }) => {
  const rolActual = await rolesRepository.buscarPorId({ rolId, empresaId })
  if (!rolActual) throw new NotFoundError('Rol')

  if (nombre && nombre !== rolActual.nombre) {
    const duplicado = await rolesRepository.existeDuplicado({ empresaId, nombre, excluirId: rolId })
    if (duplicado) throw new AppError('Ya existe un rol con ese nombre en esta empresa', 409)
  }

  const datos = {}
  if (nombre) datos.nombre = nombre
  if (descripcion !== undefined) datos.descripcion = descripcion

  if (Object.keys(datos).length === 0) {
    throw new AppError('No se enviaron campos para actualizar', 400)
  }

  const rolEditado = await rolesRepository.editar({ rolId, datos })

  await audit.log({
    usuarioId,
    empresaId,
    ip,
    modulo: 'roles',
    accion: 'UPDATE',
    tabla: 'catalogo_roles',
    registroId: rolId,
    datosAntes: { nombre: rolActual.nombre, descripcion: rolActual.descripcion },
    datosNuevos: datos,
  })

  return { rolId: rolEditado.id, nombre: rolEditado.nombre, descripcion: rolEditado.descripcion }
}

const eliminar = async ({ rolId, empresaId }, { usuarioId, ip }) => {
  const rol = await rolesRepository.buscarPorId({ rolId, empresaId })
  if (!rol) throw new NotFoundError('Rol')

  // Advertir si hay usuarios con este rol — no lo bloqueamos, pero lo informamos
  const totalUsuarios = await rolesRepository.contarUsuariosConRol({ rolId })
  if (totalUsuarios > 0) {
    throw new AppError(
      `No se puede eliminar el rol porque tiene ${totalUsuarios} usuario(s) asignado(s). Reasígnalos primero.`,
      409
    )
  }

  await rolesRepository.eliminar({ rolId })

  await audit.log({
    usuarioId,
    empresaId,
    ip,
    modulo: 'roles',
    accion: 'DELETE',
    tabla: 'catalogo_roles',
    registroId: rolId,
    datosAntes: { nombre: rol.nombre },
  })
}

/**
 * Reemplaza todos los permisos de un rol.
 * Valida que todos los permisosIds existan en el catálogo global de permisos
 * antes de asignarlos.
 */
const asignarPermisos = async ({ rolId, empresaId, permisosIds }, { usuarioId, ip }) => {
  if (!Array.isArray(permisosIds)) {
    throw new AppError('permisosIds debe ser un array', 400)
  }

  const rol = await rolesRepository.buscarPorId({ rolId, empresaId })
  if (!rol) throw new NotFoundError('Rol')

  // Validar que todos los permisos existen
  if (permisosIds.length > 0) {
    const permisosValidos = await permisosRepository.verificarPermisos({ permisosIds })
    if (permisosValidos.length !== permisosIds.length) {
      throw new AppError('Uno o más permisos no existen en el sistema', 400)
    }
  }

  await rolesRepository.reemplazarPermisos({ rolId, permisosIds })

  await audit.log({
    usuarioId,
    empresaId,
    ip,
    modulo: 'roles',
    accion: 'UPDATE',
    tabla: 'roles_permisos',
    registroId: rolId,
    datosNuevos: { permisosIds },
  })
}

module.exports = { listar, obtenerPorId, crear, editar, eliminar, asignarPermisos }