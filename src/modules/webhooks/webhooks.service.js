// src/modules/webhooks/webhooks.service.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// FLUJO OBLIGATORIO (nunca alterar el orden):
//   1. Extraer número de destino de action_type con regex
//   2. Resolver empresa desde agentes_virtuales.numero_entrada
//   3. Guardar payload RAW en pbx_eventos_raw  ← SIEMPRE, aunque falle después
//   4. Delegar evento a callOrchestrator → obtener acción de respuesta
//   5. Marcar evento como procesado
//   6. Retornar la acción al controller para que la envíe a CloudUCM
//
// FORMATO DE RETORNO:
//   Esta función retorna { action, prompt_id } (formato CloudUCM),
//   NO el envelope estándar de MERCI { ok, mensaje, data }.
//   El controller lo envía directamente a CloudUCM como respuesta HTTP.

'use strict';

const webhooksRepository = require('./webhooks.repository');
const callOrchestrator   = require('../../services/callOrchestrator.service');
const NotFoundError      = require('../../core/errors/NotFoundError');

// Acción por defecto cuando no hay otra instrucción disponible
const ACCION_DEFAULT = { action: 'play_prompt', prompt_id: 'welcome' };

/**
 * Extrae el número de entrada del IVR desde el campo action_type de CloudUCM.
 *
 * CloudUCM manda: "IVR[7099]NAME[IVR]"
 * Necesitamos:    "7099"
 *
 * Confirmado en logs reales del 2026-07-03 — siempre viene en este formato.
 * Los campos body.to, body.destino, body.called_number NO existen en CloudUCM.
 *
 * @param {Object} body - req.body del webhook
 * @returns {string|null}
 */
function _extraerNumeroDestino(body) {
  const actionType = body?.callInfo?.action_type || '';
  const match      = actionType.match(/IVR\[(\d+)\]/);
  return match ? match[1] : null;
}

/**
 * Delega el evento al orquestador correspondiente y obtiene la acción
 * de respuesta para CloudUCM.
 *
 * Eventos confirmados en prueba real (2026-07-03):
 *   callIncoming  → llamada entrante al IVR
 *   callAnswer    → IVR contesta
 *   callDTMF      → eventBody: "TIMEOUT" (20s sin tecla)
 *                   eventBody: "i"       (tecla presionada pero no configurada)
 *   callEnd       → llamada terminada
 *
 * @param {string} tipoEvento
 * @param {string} empresaId
 * @param {Object} body - payload completo de CloudUCM
 * @param {Object} agente
 * @returns {Promise<Object>} - Acción para CloudUCM
 */
async function _procesarPorTipoEvento(tipoEvento, empresaId, body, agente) {
  const callInfo = body.callInfo;

  switch (tipoEvento) {
    case 'callIncoming':
      return callOrchestrator.manejarCallIncoming(empresaId, callInfo, agente);

    case 'callAnswer':
      return callOrchestrator.manejarCallAnswer(empresaId, callInfo);

    case 'callDTMF':
      // eventBody puede ser "TIMEOUT" (20s sin tecla) o "i" (tecla inválida)
      return callOrchestrator.manejarCallDTMF(empresaId, callInfo, body.eventBody);

    case 'callEnd':
      return callOrchestrator.manejarCallEnd(empresaId, callInfo);

    default:
      // Evento desconocido — ya quedó en pbx_eventos_raw para análisis
      console.warn(`[webhooks.service] Evento desconocido de CloudUCM: "${tipoEvento}"`);
      return ACCION_DEFAULT;
  }
}

/**
 * Orquesta la recepción de un evento de CloudUCM.
 *
 * @param {Object} headers - req.headers completo
 * @param {Object} body    - req.body completo
 * @returns {Promise<Object>} - Acción CloudUCM: { action, prompt_id }
 * @throws {NotFoundError}   - Si no hay agente con ese número de entrada
 */
async function procesarEventoCloudUCM(headers, body) {
  // ── 1. Extraer número de destino con regex sobre action_type ────────────
  const numeroDestino = _extraerNumeroDestino(body);

  if (!numeroDestino) {
    throw new NotFoundError(
      'Número de destino en action_type del payload CloudUCM. ' +
      `action_type recibido: "${body?.callInfo?.action_type}"`
    );
  }

  // ── 2. Resolver empresa desde agentes_virtuales ──────────────────────────
  const agente = await webhooksRepository.buscarAgentePorNumero(numeroDestino);
  if (!agente) {
    throw new NotFoundError(`Agente virtual para número de entrada: ${numeroDestino}`);
  }

  const empresaId = agente.empresa_id;

  // ── 3. Guardar RAW — SIEMPRE, antes de cualquier procesamiento ───────────
  const configPbx  = await webhooksRepository.buscarConfigPbxActiva(empresaId);
  const eventoRaw  = await webhooksRepository.guardarEventoRaw({
    empresaId,
    pbxId:   configPbx?.id || null,
    tipo:    body.event || 'desconocido',
    headers,
    payload: body
  });

  // ── 4. Delegar al orquestador → obtener acción de respuesta ─────────────
  const tipoEvento   = body.event || '';
  const accionRespuesta = await _procesarPorTipoEvento(tipoEvento, empresaId, body, agente);

  // ── 5. Marcar evento como procesado ──────────────────────────────────────
  await webhooksRepository.marcarEventoProcesado(eventoRaw.id);

  // ── 6. Retornar acción para que el controller la envíe a CloudUCM ────────
  return accionRespuesta || ACCION_DEFAULT;
}

module.exports = { procesarEventoCloudUCM };