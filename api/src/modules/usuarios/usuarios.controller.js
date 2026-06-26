const usuariosService = require('./usuarios.service')

const listar = async (req, res, next) => {
  try {
    const { busqueda } = req.query
    const usuarios = await usuariosService.listar({
      empresaId: req.empresaId,
      busqueda,
    })
    res.json({ ok: true, mensaje: 'Usuarios obtenidos', data: { usuarios } })
  } catch (err) {
    next(err)
  }
}

const obtenerPorId = async (req, res, next) => {
  try {
    const usuario = await usuariosService.obtenerPorId({
      usuarioId: req.params.id,
      empresaId: req.empresaId,
    })
    res.json({ ok: true, mensaje: 'Usuario obtenido', data: { usuario } })
  } catch (err) {
    next(err)
  }
}

const crear = async (req, res, next) => {
  try {
    const { nombre, usuario, correo, password } = req.body

    if (!nombre || !usuario || !correo || !password) {
      return res.status(400).json({
        ok: false,
        mensaje: 'nombre, usuario, correo y password son requeridos',
      })
    }

    const nuevoUsuario = await usuariosService.crear(
      { empresaId: req.empresaId, nombre, usuario, correo, password },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )

    res.status(201).json({ ok: true, mensaje: 'Usuario creado', data: { usuario: nuevoUsuario } })
  } catch (err) {
    next(err)
  }
}

const editar = async (req, res, next) => {
  try {
    const { nombre, correo, estadoUsuarioId } = req.body

    const usuarioEditado = await usuariosService.editar(
      {
        usuarioId: req.params.id,
        empresaId: req.empresaId,
        nombre,
        correo,
        estadoUsuarioId,
      },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )

    res.json({ ok: true, mensaje: 'Usuario actualizado', data: { usuario: usuarioEditado } })
  } catch (err) {
    next(err)
  }
}

const eliminar = async (req, res, next) => {
  try {
    await usuariosService.eliminar(
      { usuarioId: req.params.id, empresaId: req.empresaId },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Usuario eliminado' })
  } catch (err) {
    next(err)
  }
}

const asignarRoles = async (req, res, next) => {
  try {
    const { rolesIds } = req.body

    await usuariosService.asignarRoles(
      { usuarioId: req.params.id, empresaId: req.empresaId, rolesIds },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )

    res.json({ ok: true, mensaje: 'Roles asignados correctamente' })
  } catch (err) {
    next(err)
  }
}

const desbloquear = async (req, res, next) => {
  try {
    await usuariosService.desbloquear(
      { usuarioId: req.params.id, empresaId: req.empresaId },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Usuario desbloqueado correctamente' })
  } catch (err) {
    next(err)
  }
}

module.exports = { listar, obtenerPorId, crear, editar, eliminar, asignarRoles, desbloquear }