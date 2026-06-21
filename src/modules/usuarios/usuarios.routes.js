const express = require('express')
const router = express.Router()
const usuariosController = require('./usuarios.controller')
const authenticate = require('../../core/middlewares/auth.middleware')
const setTenant = require('../../core/middlewares/tenant.middleware')
const { requirePermission } = require('../../core/middlewares/permission.middleware')

// Todos los endpoints de usuarios requieren autenticación y empresa resuelta
router.use(authenticate, setTenant)

router.get(
  '/',
  requirePermission('usuarios.ver'),
  usuariosController.listar
)

router.get(
  '/:id',
  requirePermission('usuarios.ver'),
  usuariosController.obtenerPorId
)

router.post(
  '/',
  requirePermission('usuarios.crear'),
  usuariosController.crear
)

router.put(
  '/:id',
  requirePermission('usuarios.editar'),
  usuariosController.editar
)

router.delete(
  '/:id',
  requirePermission('usuarios.eliminar'),
  usuariosController.eliminar
)

router.patch(
  '/:id/roles',
  requirePermission('usuarios.roles'),
  usuariosController.asignarRoles
)

module.exports = router