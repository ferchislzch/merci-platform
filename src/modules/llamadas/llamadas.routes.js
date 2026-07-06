// src/modules/llamadas/llamadas.routes.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// A diferencia de webhooks, estos endpoints SÍ tienen usuario logueado:
// son pantallas del dashboard donde un humano consulta el historial.
// Por eso llevan authMiddleware + setTenant + checkPermission.

'use strict';

const express              = require('express');
const router               = express.Router();
const authenticate         = require('../../core/middlewares/auth.middleware');
const setTenant            = require('../../core/middlewares/tenant.middleware');
const { requirePermission } = require('../../core/middlewares/permission.middleware');
const llamadasController   = require('./llamadas.controller');

// Middleware base para todas las rutas de llamadas
router.use(authenticate, setTenant);

// GET /api/llamadas
// Historial completo con paginación y filtros
router.get(
  '/',
  requirePermission('llamadas.ver'),
  llamadasController.listar
);

// POST /api/llamadas/sync-cdr
// IMPORTANTE: Esta ruta va ANTES de /:id para que Express no trate
// 'sync-cdr' como un parámetro de id.
router.post(
  '/sync-cdr',
  requirePermission('llamadas.ver'),
  llamadasController.sincronizarCDR
);

// GET /api/llamadas/:id
// Detalle individual de una llamada
router.get(
  '/:id',
  requirePermission('llamadas.detalle'),
  llamadasController.obtenerDetalle
);

module.exports = router;