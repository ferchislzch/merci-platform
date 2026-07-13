'use strict'

const express = require('express')
const router = express.Router()
const usuariosController = require('./usuarios.controller')
const authenticate = require('../../core/middlewares/auth.middleware')
const setTenant = require('../../core/middlewares/tenant.middleware')
const { requirePermission } = require('../../core/middlewares/permission.middleware')

router.use(authenticate, setTenant)

// ── Rutas con nombre fijo — DEBEN ir antes de /:id ───────────────────────────
// Express trata cualquier segmento como param. Si /stats o /estados estuvieran
// después de /:id, Express los resolvería como un UUID y el handler fallaría.

router.get(
  '/stats',
  requirePermission('usuarios.ver'),
  usuariosController.stats
)

router.get(
  '/estados',
  requirePermission('usuarios.ver'),
  usuariosController.estados
)

// ── CRUD ────────────────────────────────────────────────────────────────────

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

router.patch(
  '/:id/desbloquear',
  requirePermission('usuarios.editar'),
  usuariosController.desbloquear
)

router.patch(
  '/:id/password',
  requirePermission('usuarios.editar'),
  usuariosController.cambiarPassword
)

module.exports = router