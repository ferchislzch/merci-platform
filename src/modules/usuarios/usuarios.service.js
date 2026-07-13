'use strict'

const usuariosRepository = require('./usuarios.repository')
const rolesRepository    = require('../roles/roles.repository')
const { hashPassword, comparePassword } = require('../../core/utils/password.util')
const { NotFoundError }  = require('../../core/errors/NotFoundError')
const AppError           = require('../../core/errors/AppError')
const audit              = require('../../services/audit.service')

// ─── Helpers internos ─────────────────────────────────────────────────────────

const validarPassword = (password) => {
  if (!password || password.length < 8)
    throw new AppError('La contraseña debe tener al menos 8 caracteres', 400)
  if (!/[A-Z]/.test(password))
    throw new AppError('La contraseña debe tener al menos una mayúscula', 400)
  if (!/[0-9]/.test(password))
    throw new AppError('La contraseña debe tener al menos un número', 400)
}

/**
 * Convierte una fila de la BD al shape que usan todos los endpoints de usuarios.
 *
 * permisosUsuario: array de claves (ej. 'usuarios.ver') de los permisos asignados
 *   al usuario a través de sus roles. Solo se popula cuando se usa buscarPorId()
 *   (que hace include completo de roles_permisos → permisos). Para listar() queda
 *   como [] porque ese select no incluye la cadena completa de permisos — esto es
 *   intencional: el panel de detalle siempre hace su propio GET /usuarios/:id.
 */
const formatearUsuario = (usuario) => {
  // Extraer claves únicas de permisos atravesando roles → roles_permisos → permisos
  const permisosSet = new Set()
  for (const ur of (usuario.usuario_roles || [])) {
    for (const rp of (ur.catalogo_roles?.roles_permisos || [])) {
      const clave = rp.permisos?.clave
      if (clave) permisosSet.add(clave)
    }
  }

  return {
    usuarioId:       usuario.id,
    nombre:          usuario.nombre,
    usuario:         usuario.usuario,
    correo:          usuario.correo,
    sucursalId:      usuario.sucursal_id                       || null,
    sucursalNombre:  usuario.sucursales?.nombre                || null,
    estadoUsuarioId: usuario.estado_usuario_id                 || null,
    estado:          usuario.catalogo_estado_usuario?.nombre   || null,
    roles: (usuario.usuario_roles || []).map((ur) => ({
      rolId:  ur.catalogo_roles.id,
      nombre: ur.catalogo_roles.nombre,
    })),
    // Claves de los permisos que tiene este usuario (via sus roles)
    // Disponible solo en GET /usuarios/:id — vacío en GET /usuarios
    permisosUsuario: [...permisosSet],
    ultimoAcceso:  usuario.ultimo_acceso,
    fechaRegistro: usuario.fecha_registro,
  }
}

// ─── Casos de uso ─────────────────────────────────────────────────────────────

const listar = async ({ empresaId, sucursalId = null, excluirId = null, busqueda }) => {
  const [usuarios, bloqueados] = await Promise.all([
    usuariosRepository.listar({ empresaId, sucursalId, excluirId, busqueda }),
    usuariosRepository.obtenerUsuariosBloqueados({ empresaId }),
  ])
  return usuarios.map((u) => ({
    ...formatearUsuario(u),
    bloqueado: bloqueados.has(u.id),
  }))
}

const obtenerPorId = async ({ usuarioId, empresaId, sucursalId = null }) => {
  const [usuario, bloqueado] = await Promise.all([
    usuariosRepository.buscarPorId({ usuarioId, empresaId, sucursalId }),
    usuariosRepository.estaBloqueado({ usuarioId, empresaId }),
  ])
  if (!usuario) throw new NotFoundError('Usuario')
  return { ...formatearUsuario(usuario), bloqueado }
}

const crear = async (
  { empresaId, sucursalId = null, nombre, usuario, correo, password },
  { usuarioId: adminId, ip }
) => {
  validarPassword(password)

  const duplicado = await usuariosRepository.existeDuplicado({ empresaId, usuario, correo })
  if (duplicado) {
    const campo = duplicado.usuario === usuario ? 'nombre de usuario' : 'correo'
    throw new AppError(`Ya existe un usuario con ese ${campo} en esta empresa`, 409)
  }

  const estadoActivo = await usuariosRepository.obtenerEstadoActivo()
  if (!estadoActivo)
    throw new AppError('No se encontró el estado Activo en el catálogo', 500)

  const passwordHash = await hashPassword(password)

  const nuevoUsuario = await usuariosRepository.crear({
    empresaId, sucursalId, nombre, usuario, correo,
    passwordHash, estadoUsuarioId: estadoActivo.id,
  })

  await audit.log({
    usuarioId: adminId, empresaId, ip,
    modulo: 'usuarios', accion: 'INSERT', tabla: 'usuarios', registroId: nuevoUsuario.id,
    datosNuevos: { nombre, usuario, correo, sucursalId },
  })

  return formatearUsuario(nuevoUsuario)
}

const editar = async (
  { usuarioId, empresaId, nombre, correo, usuario: nuevoUsuario, sucursalId, estadoUsuarioId },
  { usuarioId: adminId, ip }
) => {
  const usuarioActual = await usuariosRepository.buscarPorId({ usuarioId, empresaId })
  if (!usuarioActual) throw new NotFoundError('Usuario')

  if (correo && correo !== usuarioActual.correo) {
    const dup = await usuariosRepository.existeDuplicado({
      empresaId, usuario: usuarioActual.usuario, correo, excluirId: usuarioId,
    })
    if (dup) throw new AppError('Ya existe un usuario con ese correo en esta empresa', 409)
  }

  if (nuevoUsuario && nuevoUsuario !== usuarioActual.usuario) {
    const dup = await usuariosRepository.existeDuplicado({
      empresaId, usuario: nuevoUsuario, correo: usuarioActual.correo, excluirId: usuarioId,
    })
    if (dup) throw new AppError('Ya existe un usuario con ese nombre de usuario en esta empresa', 409)
  }

  const datos = {}
  if (nombre)                   datos.nombre            = nombre
  if (correo)                   datos.correo            = correo
  if (nuevoUsuario)             datos.usuario           = nuevoUsuario
  if (sucursalId !== undefined) datos.sucursal_id       = sucursalId || null
  if (estadoUsuarioId)          datos.estado_usuario_id = estadoUsuarioId

  if (Object.keys(datos).length === 0)
    throw new AppError('No se enviaron campos para actualizar', 400)

  const usuarioEditado = await usuariosRepository.editar({ usuarioId, datos })

  await audit.log({
    usuarioId: adminId, empresaId, ip,
    modulo: 'usuarios', accion: 'UPDATE', tabla: 'usuarios', registroId: usuarioId,
    datosAntes: { nombre: usuarioActual.nombre, correo: usuarioActual.correo },
    datosNuevos: datos,
  })

  return formatearUsuario(usuarioEditado)
}

const eliminar = async ({ usuarioId, empresaId }, { usuarioId: adminId, ip }) => {
  const usuario = await usuariosRepository.buscarPorId({ usuarioId, empresaId })
  if (!usuario) throw new NotFoundError('Usuario')
  if (usuarioId === adminId) throw new AppError('No puedes eliminar tu propio usuario', 400)

  await usuariosRepository.eliminar({ usuarioId })

  await audit.log({
    usuarioId: adminId, empresaId, ip,
    modulo: 'usuarios', accion: 'DELETE', tabla: 'usuarios', registroId: usuarioId,
    datosAntes: { nombre: usuario.nombre, usuario: usuario.usuario },
  })
}

const asignarRoles = async ({ usuarioId, empresaId, rolesIds }, { usuarioId: adminId, ip }) => {
  if (!Array.isArray(rolesIds) || rolesIds.length === 0)
    throw new AppError('Debes proporcionar al menos un rol', 400)

  const usuario = await usuariosRepository.buscarPorId({ usuarioId, empresaId })
  if (!usuario) throw new NotFoundError('Usuario')

  const rolesValidos = await rolesRepository.verificarRolesDeLaEmpresa({ empresaId, rolesIds })
  if (rolesValidos.length !== rolesIds.length)
    throw new AppError('Uno o más roles no pertenecen a esta empresa', 400)

  await usuariosRepository.reemplazarRoles({ usuarioId, rolesIds })

  await audit.log({
    usuarioId: adminId, empresaId, ip,
    modulo: 'usuarios', accion: 'UPDATE', tabla: 'usuario_roles', registroId: usuarioId,
    datosNuevos: { rolesIds },
  })
}

const desbloquear = async ({ usuarioId, empresaId }, { usuarioId: adminId, ip }) => {
  const usuario = await usuariosRepository.buscarPorId({ usuarioId, empresaId })
  if (!usuario) throw new NotFoundError('Usuario')

  await usuariosRepository.limpiarIntentosDeUsuario({ usuarioId, empresaId })

  await audit.log({
    usuarioId: adminId, empresaId, ip,
    modulo: 'usuarios', accion: 'UPDATE', tabla: 'intentos_login', registroId: usuarioId,
    datosNuevos: { accion: 'desbloqueo_manual', usuarioDesbloqueado: usuario.usuario },
  })
}

const cambiarPassword = async (
  { usuarioId, empresaId, passwordActual, passwordNueva },
  { usuarioId: adminId, ip }
) => {
  validarPassword(passwordNueva)

  const usuario = await usuariosRepository.buscarPorId({ usuarioId, empresaId })
  if (!usuario) throw new NotFoundError('Usuario')

  if (adminId === usuarioId) {
    if (!passwordActual) throw new AppError('La contraseña actual es requerida', 400)
    const valida = await comparePassword(passwordActual, usuario.password_hash)
    if (!valida) throw new AppError('La contraseña actual es incorrecta', 400)
  }

  const passwordHash = await hashPassword(passwordNueva)
  await usuariosRepository.editar({ usuarioId, datos: { password_hash: passwordHash } })

  await audit.log({
    usuarioId: adminId, empresaId, ip,
    modulo: 'usuarios', accion: 'UPDATE', tabla: 'usuarios', registroId: usuarioId,
    datosNuevos: { accion: 'cambio_password' },
  })
}

const obtenerStats = ({ empresaId, sucursalId = null }) =>
  usuariosRepository.obtenerStats({ empresaId, sucursalId })

const listarEstados = () => usuariosRepository.listarEstados()

module.exports = {
  listar, obtenerPorId, crear, editar, eliminar,
  asignarRoles, desbloquear, cambiarPassword,
  obtenerStats, listarEstados,
}
