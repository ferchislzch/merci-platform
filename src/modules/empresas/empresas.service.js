const empresasRepository = require('./empresas.repository')
const { NotFoundError } = require('../../core/errors/NotFoundError')
const AppError = require('../../core/errors/AppError')
const audit = require('../../services/audit.service')

const ESTADOS_VALIDOS = ['activo', 'suspendido', 'cancelado']

const listar = () => empresasRepository.listar()

const obtenerPorId = async ({ empresaId }) => {
  const empresa = await empresasRepository.buscarPorId({ empresaId })
  if (!empresa) throw new NotFoundError('Empresa')
  return empresa
}

const crear = async ({ nombre_comercial, razon_social, rfc, telefono, correo }, { usuarioId, ip }) => {
  if (!nombre_comercial) throw new AppError('El nombre comercial es requerido', 400)

  const empresa = await empresasRepository.crear({ nombre_comercial, razon_social, rfc, telefono, correo })

  await audit.log({
    usuarioId,
    empresaId: empresa.id,
    ip,
    modulo: 'empresas',
    accion: 'INSERT',
    tabla: 'empresas',
    registroId: empresa.id,
    datosNuevos: { nombre_comercial, rfc },
  })

  return empresa
}

const editar = async ({ empresaId, nombre_comercial, razon_social, rfc, telefono, correo }, { usuarioId, ip }) => {
  const empresaActual = await empresasRepository.buscarPorId({ empresaId })
  if (!empresaActual) throw new NotFoundError('Empresa')

  const datos = {}
  if (nombre_comercial) datos.nombre_comercial = nombre_comercial
  if (razon_social !== undefined) datos.razon_social = razon_social
  if (rfc !== undefined) datos.rfc = rfc
  if (telefono !== undefined) datos.telefono = telefono
  if (correo !== undefined) datos.correo = correo

  if (Object.keys(datos).length === 0) {
    throw new AppError('No se enviaron campos para actualizar', 400)
  }

  const empresa = await empresasRepository.editar({ empresaId, datos })

  await audit.log({
    usuarioId,
    empresaId,
    ip,
    modulo: 'empresas',
    accion: 'UPDATE',
    tabla: 'empresas',
    registroId: empresaId,
    datosAntes: { nombre_comercial: empresaActual.nombre_comercial },
    datosNuevos: datos,
  })

  return empresa
}

const cambiarStatus = async ({ empresaId, status }, { usuarioId, ip }) => {
  if (!ESTADOS_VALIDOS.includes(status)) {
    throw new AppError(`Status inválido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}`, 400)
  }

  const empresa = await empresasRepository.buscarPorId({ empresaId })
  if (!empresa) throw new NotFoundError('Empresa')

  const resultado = await empresasRepository.cambiarStatus({ empresaId, status })

  await audit.log({
    usuarioId,
    empresaId,
    ip,
    modulo: 'empresas',
    accion: 'UPDATE',
    tabla: 'empresas',
    registroId: empresaId,
    datosAntes: { status: empresa.status },
    datosNuevos: { status },
  })

  return resultado
}

const eliminar = async ({ empresaId }, { usuarioId, ip }) => {
  const empresa = await empresasRepository.buscarPorId({ empresaId })
  if (!empresa) throw new NotFoundError('Empresa')

  await empresasRepository.eliminar({ empresaId })

  await audit.log({
    usuarioId,
    empresaId,
    ip,
    modulo: 'empresas',
    accion: 'DELETE',
    tabla: 'empresas',
    registroId: empresaId,
    datosAntes: { nombre_comercial: empresa.nombre_comercial },
  })
}

module.exports = { listar, obtenerPorId, crear, editar, cambiarStatus, eliminar }