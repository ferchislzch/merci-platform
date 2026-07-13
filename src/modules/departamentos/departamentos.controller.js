'use strict'

const departamentosService = require('./departamentos.service')
const AppError             = require('../../core/errors/AppError')

// Guard reutilizable: Admin General no tiene sucursalId → bloquear a nivel HTTP
const exigirSucursal = (req, next) => {
  if (!req.sucursalId) {
    next(new AppError('Esta vista requiere un contexto de sucursal activo', 403))
    return false
  }
  return true
}

const listar = async (req, res, next) => {
  try {
    if (!exigirSucursal(req, next)) return
    const departamentos = await departamentosService.listar({ sucursalId: req.sucursalId })
    res.json({ ok: true, mensaje: 'Departamentos obtenidos', data: { departamentos } })
  } catch (err) { next(err) }
}

const obtener = async (req, res, next) => {
  try {
    if (!exigirSucursal(req, next)) return
    const departamento = await departamentosService.obtenerPorId({
      departamentoId: req.params.id,
      empresaId:      req.empresaId,
    })
    res.json({ ok: true, mensaje: 'Departamento obtenido', data: { departamento } })
  } catch (err) { next(err) }
}

const crear = async (req, res, next) => {
  try {
    if (!exigirSucursal(req, next)) return
    const { nombre } = req.body
    const departamento = await departamentosService.crear(
      { sucursalId: req.sucursalId, empresaId: req.empresaId, nombre },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.status(201).json({ ok: true, mensaje: 'Departamento creado', data: { departamento } })
  } catch (err) { next(err) }
}

const editar = async (req, res, next) => {
  try {
    if (!exigirSucursal(req, next)) return
    const { nombre } = req.body
    const departamento = await departamentosService.editar(
      { departamentoId: req.params.id, empresaId: req.empresaId, nombre },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Departamento actualizado', data: { departamento } })
  } catch (err) { next(err) }
}

const eliminar = async (req, res, next) => {
  try {
    if (!exigirSucursal(req, next)) return
    await departamentosService.eliminar(
      { departamentoId: req.params.id, empresaId: req.empresaId },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Departamento eliminado' })
  } catch (err) { next(err) }
}

module.exports = { listar, obtener, crear, editar, eliminar }