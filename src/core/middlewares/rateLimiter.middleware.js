const rateLimit = require('express-rate-limit')
const env = require('../../config/env')

// Límite general para todas las rutas
const generalLimiter = rateLimit({
    windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),    // 15 minutos por defecto
    max: parseInt(env.RATE_LIMIT_MAX_REQUESTS),       // 100 requests por ventana
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        mensaje: 'Demasiadas solicitudes, intenta más tarde',
    },
})

// Límite estricto solo para login
// Evita ataques de fuerza bruta sobre credenciales
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,                   // solo 10 intentos de login por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        mensaje: 'Demasiados intentos de login, espera 15 minutos',
    },
})

// Límite para webhooks de CloudUCM
// Más permisivo porque el PBX envía muchos eventos
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 300,            // 300 eventos por minuto
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        mensaje: 'Límite de webhooks excedido',
    },
})

module.exports = { generalLimiter, authLimiter, webhookLimiter }