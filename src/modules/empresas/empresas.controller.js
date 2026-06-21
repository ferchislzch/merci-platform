const empresasService = require('./empresas.service')

const listar = async (req, res, next) => {
  try {
    const empresas = await empresasService.listar()
    res.json({ ok: true, mensaje: 'Empresas obtenidas', data: { empresas } })
  } catch (err) {
    next(err)
  }
}

const obtenerPorId = async (req, res, next) => {
  try {
    const empresa = await empresasService.obtenerPorId({ empresaId: req.params.id })
    res.json({ ok: true, mensaje: 'Empresa obtenida', data: { empresa } })
  } catch (err) {
    next(err)
  }
}

const crear = async (req, res, next) => {
  try {
    const { nombre_comercial, razon_social, rfc, telefono, correo } = req.body
    const empresa = await empresasService.crear(
      { nombre_comercial, razon_social, rfc, telefono, correo },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.status(201).json({ ok: true, mensaje: 'Empresa creada', data: { empresa } })
  } catch (err) {
    next(err)
  }
}

const editar = async (req, res, next) => {
  try {
    const { nombre_comercial, razon_social, rfc, telefono, correo } = req.body
    const empresa = await empresasService.editar(
      { empresaId: req.params.id, nombre_comercial, razon_social, rfc, telefono, correo },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Empresa actualizada', data: { empresa } })
  } catch (err) {
    next(err)
  }
}

const cambiarStatus = async (req, res, next) => {
  try {
    const { status } = req.body
    const empresa = await empresasService.cambiarStatus(
      { empresaId: req.params.id, status },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Status actualizado', data: { empresa } })
  } catch (err) {
    next(err)
  }
}

const eliminar = async (req, res, next) => {
  try {
    await empresasService.eliminar(
      { empresaId: req.params.id },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Empresa eliminada' })
  } catch (err) {
    next(err)
  }
}

module.exports = { listar, obtenerPorId, crear, editar, cambiarStatus, eliminar }