const { ForbiddenError } = require('../errors/AuthError')

// Garantiza que req.empresaId siempre esté disponible
// en los controllers de módulos que requieren aislamiento por empresa
//
// El Super Admin (esGlobal = true) puede operar sin empresa_id
// o puede recibir el empresa_id como parámetro de ruta/query
//
// USO en routes:
//   router.get('/usuarios', authenticate, setTenant, ...)
const setTenant = (req, res, next) => {
    // Super Admin puede recibir empresa_id como query param
    // para operar sobre una empresa específica
    if (req.user.esGlobal) {
        req.empresaId = req.query.empresa_id || req.params.empresaId || null
        return next()
    }

    // Usuarios normales: empresa_id viene del JWT
    if (!req.user.empresaId) {
        return next(new ForbiddenError('Usuario sin empresa asignada'))
    }

    req.empresaId = req.user.empresaId
    next()
}

module.exports = setTenant