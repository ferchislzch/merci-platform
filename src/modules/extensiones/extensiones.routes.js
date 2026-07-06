// src/modules/extensiones/extensiones.routes.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// Montado en index.routes.js como:
//   router.use('/extensiones', extensionesRoutes)
//
// Endpoints resultantes:
//   GET  /api/extensiones       → listar extensiones de BD
//   POST /api/extensiones/sync  → sincronizar desde CloudUCM

'use strict';

const express               = require('express');
const router                = express.Router();
const authenticate          = require('../../core/middlewares/auth.middleware');
const setTenant             = require('../../core/middlewares/tenant.middleware');
const { requirePermission } = require('../../core/middlewares/permission.middleware');
const extensionesController = require('./extensiones.controller');

// Middleware base para todas las rutas de extensiones
router.use(authenticate, setTenant);

// GET /api/extensiones
// Lista las extensiones almacenadas en BD para la empresa del usuario
router.get(
  '/',
  requirePermission('extensiones.ver'),
  extensionesController.listar
);

// POST /api/extensiones/sync
// IMPORTANTE: registrada antes de /:id (si se agrega en el futuro)
// para que Express no interprete 'sync' como un parámetro UUID
router.post(
  '/sync',
  requirePermission('extensiones.sync'),
  extensionesController.sincronizar
);

module.exports = router;