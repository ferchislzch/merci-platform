const rolesService = require('./roles.service')
const permisosRepository = require('./permisos.repository')

const listar = async (req, res, next) => {
  try {
    const roles = await rolesService.listar({ empresaId: req.empresaId })
    res.json({ ok: true, mensaje: 'Roles obtenidos', data: { roles } })
  } catch (err) {
    next(err)
  }
}

const obtenerPorId = async (req, res, next) => {
  try {
    const rol = await rolesService.obtenerPorId({
      rolId: req.params.id,
      empresaId: req.empresaId,
    })
    res.json({ ok: true, mensaje: 'Rol obtenido', data: { rol } })
  } catch (err) {
    next(err)
  }
}

const crear = async (req, res, next) => {
  try {
    const { nombre, descripcion, color } = req.body
    const rol = await rolesService.crear(
      { empresaId: req.empresaId, nombre, descripcion, color },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.status(201).json({ ok: true, mensaje: 'Rol creado', data: { rol } })
  } catch (err) {
    next(err)
  }
}

const editar = async (req, res, next) => {
  try {
    const { nombre, descripcion } = req.body
    const rol = await rolesService.editar(
      { rolId: req.params.id, empresaId: req.empresaId, nombre, descripcion },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Rol actualizado', data: { rol } })
  } catch (err) {
    next(err)
  }
}

const eliminar = async (req, res, next) => {
  try {
    await rolesService.eliminar(
      { rolId: req.params.id, empresaId: req.empresaId },
      { usuarioId: req.user.usuarioId, ip: req.ip }
    )
    res.json({ ok: true, mensaje: 'Rol eliminado' })
  } catch (err) {
    next(err)
  }
}

const asignarPermisos = async (req, res, next) => {
  try {
    const { permisosIds } = req.body
    await rolesService.asignarPermisos(
      { rolId: req.params.id, empresaId: req.empresaId, permisosIds },
      {
        usuarioId: req.user.usuarioId,
        ip: req.ip,
        esGlobal: req.user.esGlobal,
        permisosDelUsuario: req.user.permisos,
      }
    )
    res.json({ ok: true, mensaje: 'Permisos asignados correctamente' })
  } catch (err) {
    next(err)
  }
}

// Endpoint para listar todos los permisos disponibles del sistema
// Útil para que el frontend construya el panel de checkboxes de permisos
const listarPermisos = async (req, res, next) => {
  try {
    const permisos = await permisosRepository.listarTodos()

    // Agrupar por módulo para que el frontend los muestre en secciones
    const agrupados = permisos.reduce((acc, p) => {
      const modulo = p.modulo || 'General'
      if (!acc[modulo]) acc[modulo] = []
      acc[modulo].push({ permisoId: p.id, clave: p.clave, nombre: p.nombre })
      return acc
    }, {})

    res.json({ ok: true, mensaje: 'Permisos obtenidos', data: { permisos: agrupados } })
  } catch (err) {
    next(err)
  }
}

module.exports = { listar, obtenerPorId, crear, editar, eliminar, asignarPermisos, listarPermisos }