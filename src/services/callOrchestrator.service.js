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
//     3. Devuelve a CloudUCM una acción en su formato nativo { status, action, ... }.
//
// CONTRATO (invocado por webhooks.service._procesarPorTipoEvento):
//     manejarCallIncoming(empresaId, callInfo, agente)
//     manejarCallAnswer(empresaId, callInfo)
//     manejarCallDTMF(empresaId, callInfo, eventBody)
//     manejarCallEnd(empresaId, callInfo)
//   Cada método devuelve un objeto de acción para CloudUCM.
//
// CONTRATO CONFIRMADO CONTRA CLOUDUCM REAL (2026-07-21) — reemplaza los
//    supuestos TODO_CLOUDUCM anteriores. Evidencia: llamada real de prueba
//    (ext. 1000 → IVR 7099) capturada con ngrok + test-webhook.js, 4 eventos
//    completos (callIncoming, callAnswer, callDTMF, callEnd), y cruzada contra
//    la guía oficial "IVR Webhook User Guide" de Grandstream.
//
//   1. FORMATO DE RESPUESTA — este era el bug raíz del síntoma original
//      ("solo recibió un genérico, sin continuación"): CloudUCM exige el campo
//      `status: 0` en la respuesta o la descarta como excepción y sigue su
//      propio flujo nativo de invalid/timeout. Los verbos válidos son
//      'play' (fileName), 'playAndRead' (fileName, espera DTMF), 'makeCall'
//      (DestType/DestNumber) y 'hangup'. NO existen 'play_prompt' ni el campo
//      'prompt_id' — eran inventados. En la prueba real, las 4 respuestas del
//      código viejo ({action:'play_prompt',...}, sin status) fueron ignoradas
//      por CloudUCM durante los 43s completos de la llamada.
//
//   2. callInfo.caller_num — es el campo real del número que llama.
//      callerIdNumber/calledIdNumber NUNCA existen en el payload real.
//
//   3. El número de destino (extensión del IVR) NO llega como campo aparte;
//      solo está embebido en callInfo.action_type ("IVR[7099]NAME[IVR]").
//      Se extrae aquí con el mismo regex que ya usa webhooks.service.js.
//
//   4. eventBody en el evento callDTMF es SIEMPRE un string plano (el dígito
//      presionado, o "TIMEOUT" si no hubo respuesta) — NUNCA un objeto con
//      audio_filename. Confirmado con payload real: eventBody: "TIMEOUT".
//      Esto significa que el webhook de CloudUCM NUNCA entrega una referencia
//      de audio grabado — es un canal exclusivamente de teclado (DTMF), no
//      de voz. La rama que dispara el job 'transcribir_audio' basada en
//      eventBody.audio_filename queda documentada como inalcanzable por este
//      canal (ver nota en manejarCallDTMF) — DECISIÓN PENDIENTE, no resuelta
//      en este fix: cómo obtener el audio real del cliente (post-llamada vía
//      CDR/recapi con grabación activada, o un canal de medios en vivo).
// ════════════════════════════════════════════════════════════════════════════════

const prisma = require('../config/database');

// Acciones válidas para CloudUCM — status:0 es obligatorio, o la respuesta
// se descarta como excepción (ver nota arriba).
const ACCION_BIENVENIDA = { status: 0, action: 'play', fileName: 'welcome' };
// NOTA: 'processing' como fileName NO está confirmado como prompt subido en
// CloudUCM (a diferencia de 'welcome', que sí se vio como prompt real en el
// panel del IVR). Si CloudUCM rechaza este fileName, revisar/subir el audio
// correspondiente en PBX Settings → Voice Prompt.
const ACCION_PROCESANDO = { status: 0, action: 'play', fileName: 'processing' };
const ACCION_COLGAR     = { status: 0, action: 'hangup' };

// ── Helpers internos ─────────────────────────────────────────────────────────

/** Extrae el identificador de llamada de CloudUCM de forma defensiva. */
function _extraerPbxCallId(callInfo) {
  // Confirmado real: callInfo.session (ej. "1784680776294323-1000").
  // Se mantiene el fallback a uniqueid/callid por si CloudUCM cambia formato.
  return callInfo?.session || callInfo?.uniqueid || callInfo?.callid || null;
}

/**
 * Extrae el número de entrada del IVR desde callInfo.action_type.
 * Mismo regex que usa webhooks.service.js (CloudUCM manda "IVR[7099]NAME[IVR]").
 * Se duplica aquí (en vez de recibirlo por parámetro) para no cambiar la
 * firma pública de los métodos del contrato.
 */
function _extraerNumeroDestino(callInfo) {
  const actionType = callInfo?.action_type || '';
  const match = actionType.match(/IVR\[(\d+)\]/);
  return match ? match[1] : null;
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
  const pbxCallId      = _extraerPbxCallId(callInfo);
  const numeroDestino  = _extraerNumeroDestino(callInfo);

  // Idempotencia: si CloudUCM reenvía el evento, no duplicar la llamada.
  const existente = await _buscarLlamada(empresaId, pbxCallId);
  if (!existente) {
    await prisma.llamadas.create({
      data: {
        empresa_id:     empresaId,
        agente_id:      agente?.id ?? null,
        pbx_call_id:    pbxCallId,
        numero_origen:  callInfo?.caller_num ?? null,   // confirmado real
        numero_destino: numeroDestino,                   // extraído de action_type
        fecha_inicio:   new Date(),
        stt_estado:     'pendiente',
      },
    });
  }

  // TODO: si el agente tiene un prompt/greeting propio, reproducirlo aquí
  // en vez del 'welcome' fijo (pendiente, no bloqueante para hoy).
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
  return ACCION_BIENVENIDA;
}

/**
 * Evento con entrada del cliente por DTMF (tecla presionada o "TIMEOUT").
 *
 * ⚠️ CONFIRMADO CON PAYLOAD REAL: eventBody es SIEMPRE un string plano
 * (nunca un objeto). Este webhook NUNCA entrega audio_filename — es un
 * canal de teclado, no de voz. La rama de abajo (audioFilename) por lo
 * tanto NUNCA se dispara tal como está escrita hoy; se deja documentada
 * y sin ejecutar hasta que se decida el mecanismo real de captura de audio
 * (pendiente de decisión: CDR/recapi post-llamada vs. otro canal).
 */
async function manejarCallDTMF(empresaId, callInfo, eventBody) {
  const pbxCallId = _extraerPbxCallId(callInfo);
  const llamada   = await _buscarLlamada(empresaId, pbxCallId);

  if (!llamada) {
    // Sin llamada registrada no podemos anclar el pipeline; respondemos seguro.
    return ACCION_BIENVENIDA;
  }

  // eventBody real: "TIMEOUT" (sin tecla) o el dígito presionado (ej. "1").
  // Se mantiene el chequeo defensivo por si en algún momento CloudUCM
  // manda un objeto (no visto en pruebas reales hasta ahora).
  const audioFilename = (eventBody && typeof eventBody === 'object')
    ? (eventBody.audio_filename || eventBody.recording || null)
    : null;
  const audioFiledir  = (eventBody && typeof eventBody === 'object')
    ? (eventBody.audio_filedir || 'monitor')
    : 'monitor';

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

  // Sin audio disponible por este canal (caso normal hoy): seguir esperando.
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