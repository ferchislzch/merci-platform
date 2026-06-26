const sucursalesRepository = require('./sucursales.repository')
const { NotFoundError } = require('../../core/errors/NotFoundError')
const AppError = require('../../core/errors/AppError')
const audit = require('../../services/audit.service')

// ─── Sucursales ───────────────────────────────────────────────────────────────

const listarSucursales = ({ empresaId }) =>
  sucursalesRepository.listarSucursales({ empresaId })

const obtenerSucursal = async ({ sucursalId, empresaId }) => {
  const sucursal = await sucursalesRepository.buscarSucursalPorId({ sucursalId, empresaId })
  if (!sucursal) throw new NotFoundError('Sucursal')
  return sucursal
}

const crearSucursal = async ({ empresaId, nombre, direccion, telefono, correo }, { usuarioId, ip }) => {
  if (!nombre) throw new AppError('El nombre de la sucursal es requerido', 400)

  const sucursal = await sucursalesRepository.crearSucursal({ empresaId, nombre, direccion, telefono, correo })

  await audit.log({
    usuarioId, empresaId, ip,
    modulo: 'sucursales', accion: 'INSERT',
    tabla: 'sucursales', registroId: sucursal.id,
    datosNuevos: { nombre },
  })

  return sucursal
}

const editarSucursal = async ({ sucursalId, empresaId, nombre, direccion, telefono, correo }, { usuarioId, ip }) => {
  const sucursal = await sucursalesRepository.buscarSucursalPorId({ sucursalId, empresaId })
  if (!sucursal) throw new NotFoundError('Sucursal')

  const datos = {}
  if (nombre) datos.nombre = nombre
  if (direccion !== undefined) datos.direccion = direccion
  if (telefono !== undefined) datos.telefono = telefono
  if (correo !== undefined) datos.correo = correo

  if (Object.keys(datos).length === 0) throw new AppError('No se enviaron campos para actualizar', 400)

  const editada = await sucursalesRepository.editarSucursal({ sucursalId, datos })

  await audit.log({
    usuarioId, empresaId, ip,
    modulo: 'sucursales', accion: 'UPDATE',
    tabla: 'sucursales', registroId: sucursalId,
    datosAntes: { nombre: sucursal.nombre },
    datosNuevos: datos,
  })

  return editada
}

const eliminarSucursal = async ({ sucursalId, empresaId }, { usuarioId, ip }) => {
  const sucursal = await sucursalesRepository.buscarSucursalPorId({ sucursalId, empresaId })
  if (!sucursal) throw new NotFoundError('Sucursal')

  await sucursalesRepository.eliminarSucursal({ sucursalId })

  await audit.log({
    usuarioId, empresaId, ip,
    modulo: 'sucursales', accion: 'DELETE',
    tabla: 'sucursales', registroId: sucursalId,
    datosAntes: { nombre: sucursal.nombre },
  })
}

// ─── Departamentos ────────────────────────────────────────────────────────────

const listarDepartamentos = async ({ sucursalId, empresaId }) => {
  // Verificar que la sucursal pertenece a la empresa antes de listar sus departamentos
  const sucursal = await sucursalesRepository.buscarSucursalPorId({ sucursalId, empresaId })
  if (!sucursal) throw new NotFoundError('Sucursal')
  return sucursalesRepository.listarDepartamentos({ sucursalId })
}

const crearDepartamento = async ({ sucursalId, empresaId, nombre }, { usuarioId, ip }) => {
  if (!nombre) throw new AppError('El nombre del departamento es requerido', 400)

  const sucursal = await sucursalesRepository.buscarSucursalPorId({ sucursalId, empresaId })
  if (!sucursal) throw new NotFoundError('Sucursal')

  const departamento = await sucursalesRepository.crearDepartamento({ sucursalId, nombre })

  await audit.log({
    usuarioId, empresaId, ip,
    modulo: 'departamentos', accion: 'INSERT',
    tabla: 'departamentos', registroId: departamento.id,
    datosNuevos: { nombre, sucursal_id: sucursalId },
  })

  return departamento
}

const editarDepartamento = async ({ departamentoId, empresaId, nombre }, { usuarioId, ip }) => {
  if (!nombre) throw new AppError('El nombre del departamento es requerido', 400)

  const departamento = await sucursalesRepository.buscarDepartamentoPorId({ departamentoId, empresaId })
  if (!departamento) throw new NotFoundError('Departamento')

  const editado = await sucursalesRepository.editarDepartamento({ departamentoId, nombre })

  await audit.log({
    usuarioId, empresaId, ip,
    modulo: 'departamentos', accion: 'UPDATE',
    tabla: 'departamentos', registroId: departamentoId,
    datosAntes: { nombre: departamento.nombre },
    datosNuevos: { nombre },
  })

  return editado
}

const eliminarDepartamento = async ({ departamentoId, empresaId }, { usuarioId, ip }) => {
  const departamento = await sucursalesRepository.buscarDepartamentoPorId({ departamentoId, empresaId })
  if (!departamento) throw new NotFoundError('Departamento')

  await sucursalesRepository.eliminarDepartamento({ departamentoId })

  await audit.log({
    usuarioId, empresaId, ip,
    modulo: 'departamentos', accion: 'DELETE',
    tabla: 'departamentos', registroId: departamentoId,
    datosAntes: { nombre: departamento.nombre },
  })
}

module.exports = {
  listarSucursales, obtenerSucursal, crearSucursal, editarSucursal, eliminarSucursal,
  listarDepartamentos, crearDepartamento, editarDepartamento, eliminarDepartamento,
}