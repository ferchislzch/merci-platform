const { ForbiddenError } = require('../errors/AuthError')

// Factory que devuelve un middleware para verificar un permiso específico
// USO en routes:
//   router.post('/agentes', authenticate, requirePermission('agentes.crear'), controller)
//   router.delete('/agentes/:id', authenticate, requirePermission('agentes.eliminar'), controller)
const requirePermission = (permisoClave) => {
    return (req, res, next) => {
        // El Super Admin (esGlobal) tiene acceso total sin verificar permisos
        if (req.user.esGlobal) return next()

        const tienePermiso = req.user.permisos.includes(permisoClave)

        if (!tienePermiso) {
        return next(
            new ForbiddenError(`Se requiere el permiso: ${permisoClave}`)
        )
        }

        next()
    }
}

// Verifica que el usuario tenga AL MENOS UNO de los permisos listados
// USO: requireAnyPermission(['llamadas.ver', 'dashboard.ver'])
const requireAnyPermission = (permisosClave) => {
    return (req, res, next) => {
        if (req.user.esGlobal) return next()

        const tieneAlguno = permisosClave.some((p) =>
        req.user.permisos.includes(p)
        )

        if (!tieneAlguno) {
        return next(
            new ForbiddenError(
            `Se requiere alguno de estos permisos: ${permisosClave.join(', ')}`
            )
        )
        }

        next()
    }
}

module.exports = { requirePermission, requireAnyPermission }