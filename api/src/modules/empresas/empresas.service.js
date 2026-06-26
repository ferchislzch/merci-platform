'use strict'

const empresasRepository = require('./empresas.repository')
const { NotFoundError } = require('../../core/errors/NotFoundError')
const AppError = require('../../core/errors/AppError')
const audit = require('../../services/audit.service')

const ESTADOS_VALIDOS = ['activo', 'suspendido', 'cancelado']

// ── NUEVO: generador de código de acceso ──────────────────────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const generarCodigo = () =>
  Array.from({ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')

/**
 * Genera un codigo_acceso único de 8 caracteres alfanumérico.
 * Reintenta hasta 5 veces en caso de colisión (probabilidad ínfima).
 */
const generarCodigoUnico = async () => {
  for (let i = 0; i < 5; i++) {
    const codigo = generarCodigo()
    const existe = await empresasRepository.buscarPorCodigo(codigo)
    if (!existe) return codigo
  }
  throw new AppError('No se pudo generar un código de acceso único. Intenta de nuevo.', 500)
}

// ─── Casos de uso ─────────────────────────────────────────────────────────────

const listar = () => empresasRepository.listar()

const obtenerPorId = async ({ empresaId }) => {
  const empresa = await empresasRepository.buscarPorId({ empresaId })
  if (!empresa) throw new NotFoundError('Empresa')
  return empresa
}

// ── ACTUALIZADO: genera y guarda codigo_acceso automáticamente ────────────────
const crear = async ({ nombre_comercial, razon_social, rfc, telefono, correo }, { usuarioId, ip }) => {
  if (!nombre_comercial) throw new AppError('El nombre comercial es requerido', 400)

  const codigoAcceso = await generarCodigoUnico()

  const empresa = await empresasRepository.crear({
    nombre_comercial,
    razon_social,
    rfc,
    telefono,
    correo,
    codigoAcceso,
  })

  await audit.log({
    usuarioId,
    empresaId:   empresa.id,
    ip,
    modulo:      'empresas',
    accion:      'INSERT',
    tabla:       'empresas',
    registroId:  empresa.id,
    datosNuevos: { nombre_comercial, rfc, codigo_acceso: codigoAcceso },
  })

  return empresa // incluye codigo_acceso en la respuesta para que MERCI lo envíe por correo
}

const editar = async ({ empresaId, nombre_comercial, razon_social, rfc, telefono, correo }, { usuarioId, ip }) => {
  const empresaActual = await empresasRepository.buscarPorId({ empresaId })
  if (!empresaActual) throw new NotFoundError('Empresa')

  const datos = {}
  if (nombre_comercial)          datos.nombre_comercial = nombre_comercial
  if (razon_social !== undefined) datos.razon_social    = razon_social
  if (rfc !== undefined)          datos.rfc             = rfc
  if (telefono !== undefined)     datos.telefono        = telefono
  if (correo !== undefined)       datos.correo          = correo

  if (Object.keys(datos).length === 0) {
    throw new AppError('No se enviaron campos para actualizar', 400)
  }

  const empresa = await empresasRepository.editar({ empresaId, datos })

  await audit.log({
    usuarioId,
    empresaId,
    ip,
    modulo:      'empresas',
    accion:      'UPDATE',
    tabla:       'empresas',
    registroId:  empresaId,
    datosAntes:  { nombre_comercial: empresaActual.nombre_comercial },
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
    modulo:      'empresas',
    accion:      'UPDATE',
    tabla:       'empresas',
    registroId:  empresaId,
    datosAntes:  { status: empresa.status },
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
    modulo:      'empresas',
    accion:      'DELETE',
    tabla:       'empresas',
    registroId:  empresaId,
    datosAntes:  { nombre_comercial: empresa.nombre_comercial },
  })
}

module.exports = { listar, obtenerPorId, crear, editar, cambiarStatus, eliminar }