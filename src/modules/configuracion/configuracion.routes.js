// src/modules/configuracion/pbx.routes.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// Montado en index.routes.js como:
//   router.use('/configuracion', pbxRoutes)
//
// Endpoints resultantes:
//   GET  /api/configuracion/pbx
//   PUT  /api/configuracion/pbx
//   POST /api/configuracion/pbx/probar-conexion
//
// Solo el Admin de la empresa puede gestionar la conexión con el PBX.
// El Super Admin (esGlobal) puede necesitar acceso para soporte — se valida
// con el permiso 'configuracion_pbx.gestionar' que puede asignarse a ambos roles.

'use strict';

const express              = require('express');
const router               = express.Router();
const authenticate         = require('../../core/middlewares/auth.middleware');
const setTenant            = require('../../core/middlewares/tenant.middleware');
const { requirePermission } = require('../../core/middlewares/permission.middleware');
const pbxController        = require('./pbx.controller');

// Middleware base para todas las rutas de configuración PBX
router.use(authenticate, setTenant);

// GET /api/configuracion/pbx
router.get(
  '/pbx',
  requirePermission('configuracion_pbx.ver'),
  pbxController.obtenerConfig
);

// PUT /api/configuracion/pbx
router.put(
  '/pbx',
  requirePermission('configuracion_pbx.gestionar'),
  pbxController.guardarConfig
);

// POST /api/configuracion/pbx/probar-conexion
router.post(
  '/pbx/probar-conexion',
  requirePermission('configuracion_pbx.gestionar'),
  pbxController.probarConexion
);

module.exports = router;