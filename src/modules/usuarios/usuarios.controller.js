'use strict'

const usuariosService = require('./usuarios.service')

const listar = async (req, res, next) => {
  try {
    const { busqueda } = req.query
    const usuarios = await usuariosService.listar({
      empresaId:  req.empresaId,
      sucursalId: req.sucursalId,
      excluirId:  req.user.usuarioId,
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
      usuarioId:  req.params.id,
      empresaId:  req.empresaId,
      sucursalId: req.sucursalId,
    })
    res.json({ ok: true, mensaje: 'Usuario obtenido', data: { usuario } })
  } catch (err) {
    next(err)
  }
}

const crear = async (req, res, next) => {
  try {
    const { nombre, usuario, correo, password, sucursalId } = req.body

    if (!nombre || !usuario || !correo || !password) {
      return res.status(400).json({
        ok:      false,
        mensaje: 'nombre, usuario, correo y password son requeridos',
      })
    }

    const sucursalFinal = req.sucursalId || sucursalId || null

    const nuevoUsuario = await usuariosService.crear(
      { empresaId: req.empresaId, sucursalId: sucursalFinal, nombre, usuario, correo, password },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )

    res.status(201).json({ ok: true, mensaje: 'Usuario creado', data: { usuario: nuevoUsuario } })
  } catch (err) {
    next(err)
  }
}

const editar = async (req, res, next) => {
  try {
    const { nombre, correo, usuario, sucursalId, estadoUsuarioId } = req.body

    // Admin Sucursal (req.sucursalId definido) no puede cambiar la sucursal
    // de un usuario — ese campo solo lo procesa el Admin General
    const sucursalFinal = req.sucursalId ? undefined : sucursalId

    const usuarioEditado = await usuariosService.editar(
      {
        usuarioId:      req.params.id,
        empresaId:      req.empresaId,
        nombre,
        correo,
        usuario,
        sucursalId:     sucursalFinal,
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

const cambiarPassword = async (req, res, next) => {
  try {
    const { passwordActual, passwordNueva } = req.body

    if (!passwordNueva) {
      return res.status(400).json({
        ok:      false,
        mensaje: 'passwordNueva es requerido',
      })
    }

    await usuariosService.cambiarPassword(
      {
        usuarioId:      req.params.id,
        empresaId:      req.empresaId,
        passwordActual,
        passwordNueva,
      },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )

    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' })
  } catch (err) {
    next(err)
  }
}

const stats = async (req, res, next) => {
  try {
    const data = await usuariosService.obtenerStats({
      empresaId:  req.empresaId,
      sucursalId: req.sucursalId,
    })
    res.json({ ok: true, mensaje: 'Estadísticas obtenidas', data })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/usuarios/estados
 * Catálogo global de estados de usuario para el dropdown del form de edición.
 */
const estados = async (req, res, next) => {
  try {
    const data = await usuariosService.listarEstados()
    res.json({ ok: true, mensaje: 'Estados obtenidos', data: { estados: data } })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listar,
  obtenerPorId,
  crear,
  editar,
  eliminar,
  asignarRoles,
  desbloquear,
  cambiarPassword,
  stats,
  estados,
}