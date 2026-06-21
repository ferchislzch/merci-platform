const express = require('express')
const router = express.Router()
const rolesController = require('./roles.controller')
const authenticate = require('../../core/middlewares/auth.middleware')
const setTenant = require('../../core/middlewares/tenant.middleware')
const { requirePermission } = require('../../core/middlewares/permission.middleware')

router.use(authenticate, setTenant)

// Catálogo global de permisos — para construir el panel de checkboxes en el frontend
router.get(
  '/permisos',
  requirePermission('permisos.ver'),
  rolesController.listarPermisos
)

router.get(
  '/',
  requirePermission('roles.ver'),
  rolesController.listar
)

router.get(
  '/:id',
  requirePermission('roles.ver'),
  rolesController.obtenerPorId
)

router.post(
  '/',
  requirePermission('roles.crear'),
  rolesController.crear
)

router.put(
  '/:id',
  requirePermission('roles.editar'),
  rolesController.editar
)

router.delete(
  '/:id',
  requirePermission('roles.eliminar'),
  rolesController.eliminar
)

// Asignar/reemplazar permisos de un rol (los checkboxes del panel)
router.patch(
  '/:id/permisos',
  requirePermission('roles.editar'),
  rolesController.asignarPermisos
)

module.exports = router