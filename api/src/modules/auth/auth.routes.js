'use strict'

const express        = require('express')
const router         = express.Router()
const authController = require('./auth.controller')
const authenticate   = require('../../core/middlewares/auth.middleware')
const { authLimiter } = require('../../core/middlewares/rateLimiter.middleware')

// ─── Rutas públicas ───────────────────────────────────────────────────────────

// GET /api/auth/empresas — ELIMINADO (reemplazado por codigoAcceso en login)

router.post('/login',   authLimiter, authController.login)
router.post('/refresh', authLimiter, authController.refresh)

// ─── Rutas protegidas ─────────────────────────────────────────────────────────

router.post('/logout', authenticate, authController.logout)
router.get('/me',      authenticate, authController.me)

module.exports = router