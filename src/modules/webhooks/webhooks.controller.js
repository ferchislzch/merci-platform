// src/modules/webhooks/webhooks.controller.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// ⚠️  ESTE CONTROLADOR ES LA EXCEPCIÓN AL ENVELOPE ESTÁNDAR DE MERCI
// ─────────────────────────────────────────────────────────────────────
// TODOS los demás endpoints de MERCI responden: { ok, mensaje, data }
// ESTE endpoint responde: { "action": "...", "prompt_id": "..." }
//
// ¿Por qué? Porque el receptor NO es el frontend de MERCI sino CloudUCM
// (el PBX físico). CloudUCM ignora cualquier JSON que no siga su formato
// de acción. Si respondemos con el envelope de MERCI, la llamada se queda
// colgada sin audio y sin respuesta.
//
// El manejo de errores también es diferente: aunque algo falle internamente,
// SIEMPRE respondemos con una acción válida a CloudUCM para no cortar la
// llamada del cliente abruptamente. El error se loguea en consola.

'use strict';

const webhooksService = require('./webhooks.service');

// Acción de fallback: si algo falla internamente, al menos reproducir el audio
// de bienvenida en lugar de dejar al cliente en silencio total.
const ACCION_FALLBACK = { action: 'play_prompt', prompt_id: 'welcome' };

/**
 * POST /api/webhooks/clouducm
 *
 * Recibe eventos de llamada desde CloudUCM y responde con instrucciones
 * en el formato que CloudUCM espera (NO el envelope estándar de MERCI).
 *
 * CloudUCM espera respuesta en < 2 segundos o reintenta el webhook.
 */
async function recibirEvento(req, res, next) {
  try {
    const accionCloudUCM = await webhooksService.procesarEventoCloudUCM(
      req.headers,
      req.body
    );

    // Responder directamente con la acción de CloudUCM — sin envelope de MERCI
    return res.status(200).json(accionCloudUCM);

  } catch (error) {
    // Loguear el error para diagnóstico pero NO propagar al error.middleware
    // porque ese middleware respondería con { ok: false, mensaje: '...' }
    // que CloudUCM no entiende, dejando la llamada colgada.
    console.error('[webhooks.controller] Error procesando evento CloudUCM:', {
      mensaje:   error.message,
      evento:    req.body?.event,
      session:   req.body?.callInfo?.session,
      timestamp: new Date().toISOString()
    });

    // Responder con fallback válido para CloudUCM — nunca dejar la llamada colgada
    return res.status(200).json(ACCION_FALLBACK);
  }
}

module.exports = { recibirEvento };