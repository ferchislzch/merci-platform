const express = require('express')
const router = express.Router()
const sucursalesController = require('./sucursales.controller')
const authenticate = require('../../core/middlewares/auth.middleware')
const setTenant = require('../../core/middlewares/tenant.middleware')
const { requirePermission } = require('../../core/middlewares/permission.middleware')

router.use(authenticate, setTenant)

// Sucursales
router.get('/',    requirePermission('extensiones.ver'), sucursalesController.listar)
router.get('/:id', requirePermission('extensiones.ver'), sucursalesController.obtener)
router.post('/',   requirePermission('empresa.configurar'), sucursalesController.crear)
router.put('/:id', requirePermission('empresa.configurar'), sucursalesController.editar)
router.delete('/:id', requirePermission('empresa.configurar'), sucursalesController.eliminar)

// Departamentos — anidados bajo sucursal
router.get('/:id/departamentos',          requirePermission('extensiones.ver'),     sucursalesController.listarDepartamentos)
router.post('/:id/departamentos',         requirePermission('empresa.configurar'),  sucursalesController.crearDepartamento)
router.put('/:id/departamentos/:depId',   requirePermission('empresa.configurar'),  sucursalesController.editarDepartamento)
router.delete('/:id/departamentos/:depId',requirePermission('empresa.configurar'),  sucursalesController.eliminarDepartamento)

module.exports = router