const usuariosRepository = require('./usuarios.repository')
const rolesRepository = require('../roles/roles.repository')
const { hashPassword } = require('../../core/utils/password.util')
const { NotFoundError } = require('../../core/errors/NotFoundError')
const AppError = require('../../core/errors/AppError')
const audit = require('../../services/audit.service')

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Valida que la contraseña cumpla los requisitos mínimos:
 * al menos 8 caracteres, una mayúscula, un número.
 * El documento de diseño los lista como obligatorios.
 */
const validarPassword = (password) => {
  if (!password || password.length < 8) {
    throw new AppError('La contraseña debe tener al menos 8 caracteres', 400)
  }
  if (!/[A-Z]/.test(password)) {
    throw new AppError('La contraseña debe tener al menos una mayúscula', 400)
  }
  if (!/[0-9]/.test(password)) {
    throw new AppError('La contraseña debe tener al menos un número', 400)
  }
}

/**
 * Formatea la respuesta de un usuario para no exponer password_hash
 * ni datos internos que el frontend no necesita.
 */
const formatearUsuario = (usuario) => ({
  usuarioId: usuario.id,
  nombre: usuario.nombre,
  usuario: usuario.usuario,
  correo: usuario.correo,
  estado: usuario.catalogo_estado_usuario?.nombre || null,
  roles: (usuario.usuario_roles || []).map((ur) => ({
    rolId: ur.catalogo_roles.id,
    nombre: ur.catalogo_roles.nombre,
  })),
  ultimoAcceso: usuario.ultimo_acceso,
  fechaRegistro: usuario.fecha_registro,
})

// ─── Casos de uso ─────────────────────────────────────────────────────────────

const listar = async ({ empresaId, busqueda }) => {
  const usuarios = await usuariosRepository.listar({ empresaId, busqueda })
  return usuarios.map(formatearUsuario)
}

const obtenerPorId = async ({ usuarioId, empresaId }) => {
  const usuario = await usuariosRepository.buscarPorId({ usuarioId, empresaId })
  if (!usuario) throw new NotFoundError('Usuario')
  return formatearUsuario(usuario)
}

const crear = async ({ empresaId, nombre, usuario, correo, password }, { usuarioId: adminId, ip }) => {
  // Validar contraseña antes de hashear
  validarPassword(password)

  // Verificar duplicado de usuario o correo en la misma empresa
  const duplicado = await usuariosRepository.existeDuplicado({ empresaId, usuario, correo })
  if (duplicado) {
    const campo = duplicado.usuario === usuario ? 'nombre de usuario' : 'correo'
    throw new AppError(`Ya existe un usuario con ese ${campo} en esta empresa`, 409)
  }

  // Obtener estado 'Activo' del catálogo
  const estadoActivo = await usuariosRepository.obtenerEstadoActivo()
  if (!estadoActivo) {
    throw new AppError('No se encontró el estado Activo en el catálogo', 500)
  }

  const passwordHash = await hashPassword(password)

  const nuevoUsuario = await usuariosRepository.crear({
    empresaId,
    nombre,
    usuario,
    correo,
    passwordHash,
    estadoUsuarioId: estadoActivo.id,
  })

  await audit.log({
    usuarioId: adminId,
    empresaId,
    ip,
    modulo: 'usuarios',
    accion: 'INSERT',
    tabla: 'usuarios',
    registroId: nuevoUsuario.id,
    datosNuevos: { nombre, usuario, correo },
  })

  return formatearUsuario(nuevoUsuario)
}

const editar = async ({ usuarioId, empresaId, nombre, correo, estadoUsuarioId }, { usuarioId: adminId, ip }) => {
  // Verificar que el usuario existe en esta empresa
  const usuarioActual = await usuariosRepository.buscarPorId({ usuarioId, empresaId })
  if (!usuarioActual) throw new NotFoundError('Usuario')

  // Verificar que el correo nuevo no esté en uso por otro usuario de la misma empresa
  if (correo && correo !== usuarioActual.correo) {
    const duplicado = await usuariosRepository.existeDuplicado({
      empresaId,
      usuario: usuarioActual.usuario,
      correo,
      excluirId: usuarioId,
    })
    if (duplicado) throw new AppError('Ya existe un usuario con ese correo en esta empresa', 409)
  }

  // Solo actualizamos los campos que llegaron en el body
  const datos = {}
  if (nombre) datos.nombre = nombre
  if (correo) datos.correo = correo
  if (estadoUsuarioId) datos.estado_usuario_id = estadoUsuarioId

  if (Object.keys(datos).length === 0) {
    throw new AppError('No se enviaron campos para actualizar', 400)
  }

  const usuarioEditado = await usuariosRepository.editar({ usuarioId, datos })

  await audit.log({
    usuarioId: adminId,
    empresaId,
    ip,
    modulo: 'usuarios',
    accion: 'UPDATE',
    tabla: 'usuarios',
    registroId: usuarioId,
    datosAntes: {
      nombre: usuarioActual.nombre,
      correo: usuarioActual.correo,
      estado_usuario_id: usuarioActual.estado_usuario_id,
    },
    datosNuevos: datos,
  })

  return formatearUsuario(usuarioEditado)
}

const eliminar = async ({ usuarioId, empresaId }, { usuarioId: adminId, ip }) => {
  const usuario = await usuariosRepository.buscarPorId({ usuarioId, empresaId })
  if (!usuario) throw new NotFoundError('Usuario')

  // No permitir que un admin se elimine a sí mismo
  if (usuarioId === adminId) {
    throw new AppError('No puedes eliminar tu propio usuario', 400)
  }

  await usuariosRepository.eliminar({ usuarioId })

  await audit.log({
    usuarioId: adminId,
    empresaId,
    ip,
    modulo: 'usuarios',
    accion: 'DELETE',
    tabla: 'usuarios',
    registroId: usuarioId,
    datosAntes: { nombre: usuario.nombre, usuario: usuario.usuario },
  })
}

/**
 * Reemplaza los roles de un usuario.
 * Valida que todos los rolesIds pertenezcan a la misma empresa
 * antes de asignarlos — no se pueden asignar roles de otra empresa.
 */
const asignarRoles = async ({ usuarioId, empresaId, rolesIds }, { usuarioId: adminId, ip }) => {
  if (!Array.isArray(rolesIds) || rolesIds.length === 0) {
    throw new AppError('Debes proporcionar al menos un rol', 400)
  }

  const usuario = await usuariosRepository.buscarPorId({ usuarioId, empresaId })
  if (!usuario) throw new NotFoundError('Usuario')

  // Verificar que los roles pertenecen a esta empresa
  const rolesValidos = await rolesRepository.verificarRolesDeLaEmpresa({
    empresaId,
    rolesIds,
  })

  if (rolesValidos.length !== rolesIds.length) {
    throw new AppError('Uno o más roles no pertenecen a esta empresa', 400)
  }

  await usuariosRepository.reemplazarRoles({ usuarioId, rolesIds })

  await audit.log({
    usuarioId: adminId,
    empresaId,
    ip,
    modulo: 'usuarios',
    accion: 'UPDATE',
    tabla: 'usuario_roles',
    registroId: usuarioId,
    datosNuevos: { rolesIds },
  })
}

module.exports = { listar, obtenerPorId, crear, editar, eliminar, asignarRoles }