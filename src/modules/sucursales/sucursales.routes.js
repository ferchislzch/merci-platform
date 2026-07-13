'use strict'

const express               = require('express')
const router                = express.Router()
const sucursalesController  = require('./sucursales.controller')
const authenticate          = require('../../core/middlewares/auth.middleware')
const setTenant             = require('../../core/middlewares/tenant.middleware')
const { requirePermission } = require('../../core/middlewares/permission.middleware')

router.use(authenticate, setTenant)

// NOTA: permisos corregidos — antes usaban 'extensiones.ver' (bug)
router.get(   '/',     requirePermission('sucursales.gestionar'), sucursalesController.listar)
router.get(   '/:id',  requirePermission('sucursales.gestionar'), sucursalesController.obtener)
router.post(  '/',     requirePermission('sucursales.gestionar'), sucursalesController.crear)
router.put(   '/:id',  requirePermission('sucursales.gestionar'), sucursalesController.editar)
router.delete('/:id',  requirePermission('sucursales.gestionar'), sucursalesController.eliminar)

module.exports = router