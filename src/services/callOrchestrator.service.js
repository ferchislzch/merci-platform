// src/services/callOrchestrator.service.js
// ════════════════════════════════════════════════════════════════════════════════
// callOrchestrator — PUENTE Bina 3 (Telefonía/CloudUCM)  ↔  Bina 4 (Pipeline IA)
// ════════════════════════════════════════════════════════════════════════════════
//
// PROPÓSITO
//   webhooks.service (Bina 3) delega aquí cada evento de una llamada de CloudUCM.
//   Este orquestador:
//     1. Crea/actualiza el registro en `llamadas`.
//     2. Cuando hay audio del cliente, ENCOLA el job 'transcribir_audio' que arranca
//        el pipeline autónomo de Bina 4 (STT → LLM → TTS vía jobs_async).
//     3. Devuelve a CloudUCM una acción en su formato nativo { action, prompt_id, ... }.
//
// CONTRATO (invocado por webhooks.service._procesarPorTipoEvento):
//     manejarCallIncoming(empresaId, callInfo, agente)
//     manejarCallAnswer(empresaId, callInfo)
//     manejarCallDTMF(empresaId, callInfo, eventBody)
//     manejarCallEnd(empresaId, callInfo)
//   Cada método devuelve un objeto de acción para CloudUCM.
//
// ⚠️ TODO_CLOUDUCM — PENDIENTE DE VERIFICAR CON LA CENTRAL REAL:
//   Nadie (ni Bina 3 ni Bina 4) capturó el JSON exacto de CloudUCM (acceso caído).
//   Los puntos marcados TODO_CLOUDUCM abajo asumen nombres de campo/acciones razonables
//   que DEBEN confirmarse ejecutando test-webhook.js contra una llamada real:
//     - nombre del campo del pbx_call_id dentro de callInfo (session? callid?)
//     - de qué evento/campo llega el nombre del archivo de grabación (audio_filename)
//     - los verbos de acción válidos ('play_prompt', 'play_tts', 'hangup', ...)
//   Hasta confirmarlo, se responde el fallback seguro que CloudUCM ya aceptó en pruebas.
// ════════════════════════════════════════════════════════════════════════════════

const prisma = require('../config/database');

// Acción segura conocida (CloudUCM la aceptó en las pruebas con test-webhook.js)
const ACCION_BIENVENIDA = { action: 'play_prompt', prompt_id: 'welcome' };
const ACCION_PROCESANDO = { action: 'play_prompt', prompt_id: 'processing' };
const ACCION_COLGAR     = { action: 'hangup' };

// ── Helpers internos ─────────────────────────────────────────────────────────

/** Extrae el identificador de llamada de CloudUCM de forma defensiva. */
function _extraerPbxCallId(callInfo) {
  // TODO_CLOUDUCM: confirmar el campo real (session / callid / uniqueid).
  return callInfo?.pbx_call_id || callInfo?.session || callInfo?.callid || null;
}

/** Busca la llamada activa por (empresa_id, pbx_call_id). */
async function _buscarLlamada(empresaId, pbxCallId) {
  if (!pbxCallId) return null;
  return prisma.llamadas.findFirst({
    where: { empresa_id: empresaId, pbx_call_id: pbxCallId },
  });
}

// ── Métodos del contrato ─────────────────────────────────────────────────────

/**
 * Llamada entrante al IVR. Crea el registro de la llamada y saluda.
 */
async function manejarCallIncoming(empresaId, callInfo, agente) {
  const pbxCallId = _extraerPbxCallId(callInfo);

  // Idempotencia: si CloudUCM reenvía el evento, no duplicar la llamada.
  const existente = await _buscarLlamada(empresaId, pbxCallId);
  if (!existente) {
    await prisma.llamadas.create({
      data: {
        empresa_id:     empresaId,
        agente_id:      agente?.id ?? null,
        pbx_call_id:    pbxCallId,
        numero_origen:  callInfo?.callerIdNumber ?? callInfo?.from ?? null, // TODO_CLOUDUCM
        numero_destino: callInfo?.calledIdNumber ?? null,                   // TODO_CLOUDUCM
        fecha_inicio:   new Date(),
        stt_estado:     'pendiente',
      },
    });
  }

  // TODO_CLOUDUCM: si el agente tiene un prompt/greeting propio, reproducirlo aquí.
  return ACCION_BIENVENIDA;
}

/**
 * El IVR contestó. Marca la llamada como en proceso.
 */
async function manejarCallAnswer(empresaId, callInfo) {
  const pbxCallId = _extraerPbxCallId(callInfo);
  const llamada   = await _buscarLlamada(empresaId, pbxCallId);

  if (llamada) {
    await prisma.llamadas.update({
      where: { id: llamada.id },
      data:  { fecha_inicio: llamada.fecha_inicio ?? new Date() },
    });
  }
  // TODO_CLOUDUCM: verbo real para "empezar a escuchar/grabar al cliente".
  return ACCION_BIENVENIDA;
}

/**
 * Evento con entrada del cliente (DTMF o grabación lista). Si hay audio,
 * ENCOLA el job 'transcribir_audio' que arranca el pipeline de IA (Bina 4).
 */
async function manejarCallDTMF(empresaId, callInfo, eventBody) {
  const pbxCallId = _extraerPbxCallId(callInfo);
  const llamada   = await _buscarLlamada(empresaId, pbxCallId);

  if (!llamada) {
    // Sin llamada registrada no podemos anclar el pipeline; respondemos seguro.
    return ACCION_BIENVENIDA;
  }

  // TODO_CLOUDUCM: confirmar de qué campo llega el nombre del archivo de grabación.
  const audioFilename = eventBody?.audio_filename
                      || eventBody?.recording
                      || callInfo?.record_file
                      || null;
  const audioFiledir  = eventBody?.audio_filedir || 'monitor';

  if (audioFilename) {
    // Encolar el job que consume el Daemon STT de Bina 4 (self-chaining a LLM/TTS).
    await prisma.jobs_async.create({
      data: {
        empresa_id: empresaId,
        tipo:       'transcribir_audio',
        status:     'pendiente',
        payload: {
          llamada_id:     llamada.id,
          audio_filename: audioFilename,
          audio_filedir:  audioFiledir,
        },
      },
    });
    await prisma.llamadas.update({
      where: { id: llamada.id },
      data:  { stt_estado: 'pendiente' },
    });
    return ACCION_PROCESANDO;
  }

  // Sin audio aún: seguir esperando entrada del cliente.
  return ACCION_BIENVENIDA;
}

/**
 * La llamada terminó. Marca fin y libera.
 */
async function manejarCallEnd(empresaId, callInfo) {
  const pbxCallId = _extraerPbxCallId(callInfo);
  const llamada   = await _buscarLlamada(empresaId, pbxCallId);

  if (llamada) {
    const fin = new Date();
    const dur = llamada.fecha_inicio
      ? Math.max(0, Math.round((fin - new Date(llamada.fecha_inicio)) / 1000))
      : null;
    await prisma.llamadas.update({
      where: { id: llamada.id },
      data:  { fecha_fin: fin, duracion_seg: dur },
    });
  }
  return ACCION_COLGAR;
}

module.exports = {
  manejarCallIncoming,
  manejarCallAnswer,
  manejarCallDTMF,
  manejarCallEnd,
};