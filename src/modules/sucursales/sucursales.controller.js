'use strict'

const sucursalesService = require('./sucursales.service')

const listar = async (req, res, next) => {
  try {
    const sucursales = await sucursalesService.listarSucursales({ empresaId: req.empresaId })
    res.json({ ok: true, mensaje: 'Sucursales obtenidas', data: { sucursales } })
  } catch (err) { next(err) }
}

const obtener = async (req, res, next) => {
  try {
    const sucursal = await sucursalesService.obtenerSucursal({
      sucursalId: req.params.id,
      empresaId:  req.empresaId,
    })
    res.json({ ok: true, mensaje: 'Sucursal obtenida', data: { sucursal } })
  } catch (err) { next(err) }
}

const crear = async (req, res, next) => {
  try {
    const { nombre, direccion, telefono, correo } = req.body
    const sucursal = await sucursalesService.crearSucursal(
      { empresaId: req.empresaId, nombre, direccion, telefono, correo },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.status(201).json({ ok: true, mensaje: 'Sucursal creada', data: { sucursal } })
  } catch (err) { next(err) }
}

const editar = async (req, res, next) => {
  try {
    const { nombre, direccion, telefono, correo } = req.body
    const sucursal = await sucursalesService.editarSucursal(
      { sucursalId: req.params.id, empresaId: req.empresaId, nombre, direccion, telefono, correo },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Sucursal actualizada', data: { sucursal } })
  } catch (err) { next(err) }
}

const eliminar = async (req, res, next) => {
  try {
    await sucursalesService.eliminarSucursal(
      { sucursalId: req.params.id, empresaId: req.empresaId },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Sucursal eliminada' })
  } catch (err) { next(err) }
}

module.exports = { listar, obtener, crear, editar, eliminar }