const sucursalesService = require('./sucursales.service')

// ─── Sucursales ───────────────────────────────────────────────────────────────

const listar = async (req, res, next) => {
  try {
    const sucursales = await sucursalesService.listarSucursales({ empresaId: req.empresaId })
    res.json({ ok: true, mensaje: 'Sucursales obtenidas', data: { sucursales } })
  } catch (err) { next(err) }
}

const obtener = async (req, res, next) => {
  try {
    const sucursal = await sucursalesService.obtenerSucursal({ sucursalId: req.params.id, empresaId: req.empresaId })
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

// ─── Departamentos ────────────────────────────────────────────────────────────

const listarDepartamentos = async (req, res, next) => {
  try {
    const departamentos = await sucursalesService.listarDepartamentos({
      sucursalId: req.params.id,
      empresaId: req.empresaId,
    })
    res.json({ ok: true, mensaje: 'Departamentos obtenidos', data: { departamentos } })
  } catch (err) { next(err) }
}

const crearDepartamento = async (req, res, next) => {
  try {
    const { nombre } = req.body
    const departamento = await sucursalesService.crearDepartamento(
      { sucursalId: req.params.id, empresaId: req.empresaId, nombre },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.status(201).json({ ok: true, mensaje: 'Departamento creado', data: { departamento } })
  } catch (err) { next(err) }
}

const editarDepartamento = async (req, res, next) => {
  try {
    const { nombre } = req.body
    const departamento = await sucursalesService.editarDepartamento(
      { departamentoId: req.params.depId, empresaId: req.empresaId, nombre },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Departamento actualizado', data: { departamento } })
  } catch (err) { next(err) }
}

const eliminarDepartamento = async (req, res, next) => {
  try {
    await sucursalesService.eliminarDepartamento(
      { departamentoId: req.params.depId, empresaId: req.empresaId },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Departamento eliminado' })
  } catch (err) { next(err) }
}

module.exports = {
  listar, obtener, crear, editar, eliminar,
  listarDepartamentos, crearDepartamento, editarDepartamento, eliminarDepartamento,
}