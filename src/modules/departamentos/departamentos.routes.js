'use strict'

const express                  = require('express')
const router                   = express.Router()
const departamentosController  = require('./departamentos.controller')
const authenticate             = require('../../core/middlewares/auth.middleware')
const setTenant                = require('../../core/middlewares/tenant.middleware')
const { requirePermission }    = require('../../core/middlewares/permission.middleware')

router.use(authenticate, setTenant)

router.get(   '/',     requirePermission('departamentos.ver'),       departamentosController.listar)
router.get(   '/:id',  requirePermission('departamentos.ver'),       departamentosController.obtener)
router.post(  '/',     requirePermission('departamentos.gestionar'),  departamentosController.crear)
router.put(   '/:id',  requirePermission('departamentos.gestionar'),  departamentosController.editar)
router.delete('/:id',  requirePermission('departamentos.gestionar'),  departamentosController.eliminar)

module.exports = router