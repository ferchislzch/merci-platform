// src/modules/webhooks/webhooks.routes.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// IMPORTANTE — POR QUÉ NO HAY authMiddleware AQUÍ:
// CloudUCM es un sistema externo (el PBX físico) que manda eventos HTTP
// directamente a MERCI. No tiene un usuario, no tiene sesión, no tiene JWT.
// Si se le pusiera authMiddleware, CloudUCM nunca podría conectarse.
//
// En su lugar se usa webhookLimiter (300 eventos/min) que es más permisivo
// que el limitador general porque CloudUCM puede mandar varios eventos
// seguidos durante una llamada activa (ring → answer → hangup + reintentos).
//
// La autenticación/autorización de los eventos se hace dentro del service:
// verificando que el número de destino pertenezca a un agente virtual conocido.

'use strict';

const express                = require('express');
const router                 = express.Router();
const { webhookLimiter }     = require('../../core/middlewares/rateLimiter.middleware');
const webhooksController     = require('./webhooks.controller');

// POST /api/webhooks/clouducm
router.post('/clouducm', webhookLimiter, webhooksController.recibirEvento);

module.exports = router;