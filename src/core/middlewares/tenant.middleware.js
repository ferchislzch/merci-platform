const { ForbiddenError } = require('../errors/AuthError')

const setTenant = (req, res, next) => {
  // Super Admin puede recibir empresa_id como query param
  if (req.user.esGlobal) {
    req.empresaId  = req.query.empresa_id || req.params.empresaId || null
    req.sucursalId = null // Super Admin nunca tiene scope de sucursal
    return next()
  }

  // Usuarios normales: empresa_id viene del JWT
  if (!req.user.empresaId) {
    return next(new ForbiddenError('Usuario sin empresa asignada'))
  }

  req.empresaId  = req.user.empresaId
  req.sucursalId = req.user.sucursalId || null
  // null  → Admin General: ve toda la empresa
  // UUID  → Admin de Sucursal: los repositories filtran por esta sucursal

  next()
}

module.exports = setTenant