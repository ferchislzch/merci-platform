const express = require('express')
const router = express.Router()
const authController = require('./auth.controller')
const authenticate = require('../../core/middlewares/auth.middleware')
const { authLimiter } = require('../../core/middlewares/rateLimiter.middleware')

// ─── Rutas públicas (sin autenticación) ──────────────────────────────────────

// Autocomplete de empresas para el formulario de login
// Sin authLimiter aquí: es una búsqueda de texto, no un intento de acceso.
// El generalLimiter global (100 req/15min) ya la cubre.
router.get('/empresas', authController.buscarEmpresas)

// Login — authLimiter estricto (10 intentos/IP cada 15 minutos)
router.post('/login', authLimiter, authController.login)

// Refresh — authLimiter también, para evitar abuso de rotación de tokens
router.post('/refresh', authLimiter, authController.refresh)

// ─── Rutas protegidas (requieren JWT válido + sesión activa) ─────────────────

// Logout — requiere authenticate para saber de quién es la sesión a cerrar
// (el refreshToken viene en el body, pero authenticate garantiza que el
// access token del header también sea válido, evitando que alguien
// intente cerrar sesiones ajenas con un refreshToken robado)
router.post('/logout', authenticate, authController.logout)

// Datos del usuario actual — útil para que el frontend sepa quién está logueado
// después de recargar la página o remontar la app
router.get('/me', authenticate, authController.me)

module.exports = router