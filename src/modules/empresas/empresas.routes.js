const express = require('express')
const router = express.Router()
const empresasController = require('./empresas.controller')
const authenticate = require('../../core/middlewares/auth.middleware')
const { ForbiddenError } = require('../../core/errors/AuthError')

// Todos los endpoints de empresas son exclusivos del Super Admin
// No usamos requirePermission aquí porque los permisos son por empresa,
// y el Super Admin no pertenece a ninguna empresa.
// En cambio, verificamos esGlobal directamente.
const soloSuperAdmin = (req, res, next) => {
  if (!req.user.esGlobal) {
    return next(new ForbiddenError('Solo el Super Administrador puede acceder a este recurso'))
  }
  next()
}

router.use(authenticate, soloSuperAdmin)

router.get('/',         empresasController.listar)
router.get('/:id',      empresasController.obtenerPorId)
router.post('/',        empresasController.crear)
router.put('/:id',      empresasController.editar)
router.patch('/:id/status', empresasController.cambiarStatus)
router.delete('/:id',   empresasController.eliminar)

module.exports = router