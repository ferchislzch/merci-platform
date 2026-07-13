'use strict'

const departamentosRepository = require('./departamentos.repository')
const { NotFoundError } = require('../../core/errors/NotFoundError')
const AppError           = require('../../core/errors/AppError')
const audit              = require('../../services/audit.service')

// sucursalId viene del JWT (req.sucursalId) — ya está validado por setTenant
const listar = ({ sucursalId }) =>
  departamentosRepository.listar({ sucursalId })

const obtenerPorId = async ({ departamentoId, empresaId }) => {
  const departamento = await departamentosRepository.buscarPorId({ departamentoId, empresaId })
  if (!departamento) throw new NotFoundError('Departamento')
  return departamento
}

const crear = async ({ sucursalId, empresaId, nombre }, { usuarioId, ip }) => {
  if (!nombre?.trim()) throw new AppError('El nombre del departamento es requerido', 400)

  const departamento = await departamentosRepository.crear({
    sucursalId,
    nombre: nombre.trim(),
  })

  await audit.log({
    usuarioId, empresaId, ip,
    modulo: 'departamentos', accion: 'INSERT',
    tabla: 'departamentos', registroId: departamento.id,
    datosNuevos: { nombre: departamento.nombre, sucursal_id: sucursalId },
  })

  return departamento
}

const editar = async ({ departamentoId, empresaId, nombre }, { usuarioId, ip }) => {
  if (!nombre?.trim()) throw new AppError('El nombre del departamento es requerido', 400)

  const departamento = await departamentosRepository.buscarPorId({ departamentoId, empresaId })
  if (!departamento) throw new NotFoundError('Departamento')

  const editado = await departamentosRepository.editar({
    departamentoId,
    nombre: nombre.trim(),
  })

  await audit.log({
    usuarioId, empresaId, ip,
    modulo: 'departamentos', accion: 'UPDATE',
    tabla: 'departamentos', registroId: departamentoId,
    datosAntes: { nombre: departamento.nombre },
    datosNuevos: { nombre: editado.nombre },
  })

  return editado
}

const eliminar = async ({ departamentoId, empresaId }, { usuarioId, ip }) => {
  const departamento = await departamentosRepository.buscarPorId({ departamentoId, empresaId })
  if (!departamento) throw new NotFoundError('Departamento')

  await departamentosRepository.eliminar({ departamentoId })

  await audit.log({
    usuarioId, empresaId, ip,
    modulo: 'departamentos', accion: 'DELETE',
    tabla: 'departamentos', registroId: departamentoId,
    datosAntes: { nombre: departamento.nombre },
  })
}

module.exports = { listar, obtenerPorId, crear, editar, eliminar }