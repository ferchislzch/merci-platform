/**
 * ttsProceso.job.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Worker Asíncrono: Procesamiento TTS (Text-To-Speech)
 * Ruta oficial: src/jobs/ttsProceso.job.js
 * Bina #4 — Johann & Kevin
 *
 * RESPONSABILIDADES:
 *   1.  Sondear jobs_async buscando jobs de tipo 'procesar_tts'
 *   2.  Tomar un job de forma atómica con SELECT FOR UPDATE SKIP LOCKED
 *   3.  FAIL-FAST #1: si respuesta_ia está vacía → error (el LLM aún no completó)
 *   4.  FAIL-FAST #2: si pbx_call_id es nulo → error (usuario colgó, abortar
 *       antes de sintetizar para conservar tokens TTS y dinero)
 *   5.  Sintetizar voz via AIProviderFactory.getProvider('tts') + synthesize()
 *       El provider retorna audio ya resampleado a 8kHz G.711 WAV (listo para UCM)
 *   6.  Subir el audio al UCM via CloudUCMProvider.uploadPrompt()
 *   7.  Reproducir el audio en la llamada activa via CloudUCMProvider.playPrompt()
 *   8.  Registrar consumo financiero via AIProviderFactory.registrarConsumo()
 *   9.  Actualizar llamadas (tts_estado = 'completado')
 *  10.  Cerrar job + emitir WebSocket 'tts_completado'
 *
 * TENANT ISOLATION EN CloudUCMProvider:
 *   Se instancia UN NUEVO CloudUCMProvider() por cada ejecución de job.
 *   La clase guarda estado de sesión (this.cookie, this.baseUrl) internamente.
 *   Instanciar por job garantiza que nunca se mezclen sesiones entre empresas,
 *   eliminando el riesgo de condiciones de carrera multi-tenant.
 *   La clase llama a connect(empresaId) via _ensureSession() al primer uso,
 *   leyendo las credenciales PBX de la empresa desde configuraciones_pbx.
 *
 * FAIL-FAST DE COSTO (pbx_call_id nulo):
 *   Verificamos pbx_call_id ANTES de llamar al TTS. Si el usuario colgó y la
 *   llamada ya no tiene ID de canal activo, sintetizar audio sería gasto puro.
 *   Este check previene cobros innecesarios de tokens TTS a la empresa.
 *
 * ESTRUCTURA ESPERADA DEL PAYLOAD EN jobs_async:
 * {
 *   "llamada_id":   "uuid-de-la-llamada",
 *   "proveedor_id": "uuid-de-openai-tts-en-catalogo_proveedores_ia"
 * }
 *
 * DEPENDENCIAS DE BINA 3:
 *   CloudUCMProvider (src/services/pbx/CloudUCMProvider.js)
 *   Métodos utilizados:
 *     · uploadPrompt(empresaId, filename, audioBuffer) — multipart/form-data al UCM
 *     · playPrompt(empresaId, callId, filename)        — reproduce prompt en llamada activa
 *   Ambos métodos gestionan autenticación MD5 internamente via _ensureSession().
 *
 * SIMETRÍA CON PIPELINE IA:
 *   stt_estado   ← sttProceso.job.js  (transcripción)
 *   llm_estado   ← llmProceso.job.js  (respuesta IA)
 *   tts_estado   ← ttsProceso.job.js  (síntesis de voz)  ← este archivo
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const prisma              = require('../config/database');
const AIProviderFactory   = require('../providers/AIProviderFactory');
const CloudUCMProvider    = require('../services/pbx/CloudUCMProvider');

// ─── TODO [Bina 1]: WebSocket Service ────────────────────────────────────────
// Reemplazar stub con la instancia real de Socket.io cuando Bina 1 lo exponga.
// Mismo patrón que sttProceso.job.js y llmProceso.job.js.
const SocketService = {
  emit: (sala, evento, payload) => {
    console.log(`[SocketService STUB] → sala: '${sala}' | evento: '${evento}'`, payload);
  }
};

// ─── Identidad y Configuración del Worker ─────────────────────────────────────

const WORKER_ID = `tts-worker-pid${process.pid}-${Date.now()}`;

const CONFIG = {
  POLL_INTERVAL_MS:    5_000,
  MAX_JOBS_POR_CICLO:  5,
  JOB_TIPO:           'procesar_tts',
  LOCK_TIMEOUT_MIN:    10,
};

// ─── Operaciones de Cola (raw SQL obligatorio) ────────────────────────────────

/**
 * Toma el siguiente job disponible de forma atómica.
 * SELECT FOR UPDATE SKIP LOCKED — misma implementación que STT y LLM workers.
 * @returns {Promise<Object|null>}
 */
async function _tomarSiguienteJob() {
  const resultado = await prisma.$queryRaw`
    UPDATE jobs_async
    SET
      status       = 'procesando',
      worker_id    = ${WORKER_ID},
      locked_at    = NOW(),
      fecha_inicio = NOW(),
      intentos     = intentos + 1
    WHERE id = (
      SELECT id
      FROM   jobs_async
      WHERE  tipo             = ${CONFIG.JOB_TIPO}
        AND  status           = 'pendiente'
        AND  fecha_programada <= NOW()
      ORDER BY fecha_programada ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      empresa_id,
      payload,
      intentos,
      max_intentos
  `;
  return resultado.length > 0 ? resultado[0] : null;
}

/**
 * Libera jobs huérfanos de workers caídos (locked_at expirado).
 */
async function _liberarJobsHuerfanos() {
  const tiempoLimite = new Date(Date.now() - CONFIG.LOCK_TIMEOUT_MIN * 60 * 1000);
  await prisma.$queryRaw`
    UPDATE jobs_async
    SET
      status    = 'pendiente',
      worker_id = NULL,
      locked_at = NULL
    WHERE status    = 'procesando'
      AND tipo      = ${CONFIG.JOB_TIPO}
      AND locked_at < ${tiempoLimite}
  `;
}

/**
 * Marca un job como completado y libera el lock.
 */
async function _marcarCompletado(jobId, empresaId) {
  await prisma.$queryRaw`
    UPDATE jobs_async
    SET
      status    = 'completado',
      worker_id = NULL,
      locked_at = NULL,
      fecha_fin = NOW()
    WHERE id         = ${jobId}
      AND empresa_id = ${empresaId}
  `;
}

/**
 * Maneja el fallo de un job: reintento o error definitivo.
 * Revierte tts_estado a 'error' en la llamada asociada.
 *
 * @param {Object}      job
 * @param {string}      mensajeError
 * @param {string|null} llamadaId
 */
async function _manejarFalloJob(job, mensajeError, llamadaId) {
  const { id: jobId, empresa_id: empresaId, intentos, max_intentos } = job;
  const agotado = intentos >= max_intentos;

  console.error(
    `[TTS Job][${WORKER_ID}] ❌ Error en job ${jobId} ` +
    `(intento ${intentos}/${max_intentos}): ${mensajeError}`
  );

  // Revertir tts_estado para que la llamada no quede bloqueada en 'procesando'
  if (llamadaId) {
    try {
      await prisma.llamadas.update({
        where: { id: llamadaId, empresa_id: empresaId }, // MULTI-TENANT
        data:  { tts_estado: 'error' }
      });
    } catch (updateErr) {
      console.warn(
        `[TTS Job][${WORKER_ID}] No se pudo revertir tts_estado ` +
        `de llamada ${llamadaId}: ${updateErr.message}`
      );
    }
  }

  if (agotado) {
    await prisma.$queryRaw`
      UPDATE jobs_async
      SET
        status        = 'error',
        worker_id     = NULL,
        locked_at     = NULL,
        error_detalle = ${mensajeError},
        fecha_fin     = NOW()
      WHERE id         = ${jobId}
        AND empresa_id = ${empresaId}
    `;
    console.error(
      `[TTS Job][${WORKER_ID}] Job ${jobId} agotó ${max_intentos} intentos → 'error'.`
    );
  } else {
    await prisma.$queryRaw`
      UPDATE jobs_async
      SET
        status        = 'pendiente',
        worker_id     = NULL,
        locked_at     = NULL,
        error_detalle = ${mensajeError}
      WHERE id         = ${jobId}
        AND empresa_id = ${empresaId}
    `;
    console.warn(
      `[TTS Job][${WORKER_ID}] Job ${jobId} regresado a 'pendiente' para reintento.`
    );
  }
}

// ─── Procesamiento Principal del Job ─────────────────────────────────────────

/**
 * Procesa un job de síntesis de voz de principio a fin.
 *
 * Orden de operaciones diseñado para minimizar costos:
 *   1. Validaciones baratas (payload, BD) → primero
 *   2. FAIL-FAST antes de operaciones costosas (TTS API, CloudUCM auth) → segundo
 *   3. Síntesis y reproducción → al final, solo si todo es válido
 *
 * @param {Object} job - Registro de jobs_async tomado con SKIP LOCKED
 */
async function _procesarJob(job) {
  const {
    id:         jobId,
    empresa_id: empresaId,
    payload
  } = job;

  const { llamada_id, proveedor_id } = payload ?? {};

  if (!llamada_id) {
    throw new Error(
      `Payload inválido en job ${jobId}. ` +
      `Campo requerido: 'llamada_id'. Recibido: ${JSON.stringify(payload)}`
    );
  }

  console.log(`[TTS Job][${WORKER_ID}] ▶ Iniciando job ${jobId} | llamada: ${llamada_id}`);

  // ── Paso 1: Leer la llamada ───────────────────────────────────────────────
  const llamada = await prisma.llamadas.findUnique({
    where:  { id: llamada_id, empresa_id: empresaId }, // MULTI-TENANT
    select: {
      id:           true,
      empresa_id:   true,
      pbx_call_id:  true,   // Canal activo en CloudUCM — nullable
      respuesta_ia: true,   // Texto generado por el LLM (input al TTS)
    }
  });

  if (!llamada) {
    throw new Error(
      `[TTS Job] Llamada ${llamada_id} no encontrada para empresa ${empresaId}. ` +
      `Verifica que el job apunte a una llamada válida y del mismo tenant.`
    );
  }

  // ── FAIL-FAST #1: respuesta_ia vacía ─────────────────────────────────────
  // Si el LLM no generó respuesta, no hay texto que sintetizar.
  // El job LLM debería completarse antes de encolar el job TTS.
  if (!llamada.respuesta_ia?.trim()) {
    throw new Error(
      `[TTS Job] La llamada ${llamada_id} no tiene 'respuesta_ia'. ` +
      `El Worker LLM debe completarse antes de encolar el job TTS. ` +
      `Verifica el orden del pipeline y el estado de llmProceso.job.js.`
    );
  }

  // ── FAIL-FAST #2: pbx_call_id nulo (usuario colgó) ───────────────────────
  // Verificamos ANTES de llamar al TTS para evitar gastar tokens en audio
  // que nunca se reproducirá. Si el usuario colgó, la llamada ya no tiene
  // un canal activo en CloudUCM y no hay dónde reproducir el prompt.
  if (!llamada.pbx_call_id?.trim()) {
    throw new Error(
      `[TTS Job] La llamada ${llamada_id} no tiene 'pbx_call_id' (canal activo). ` +
      `El usuario probablemente colgó antes de que el pipeline TTS iniciara. ` +
      `Se aborta la síntesis para conservar tokens y evitar costos innecesarios.`
    );
  }

  const textoParaSintetizar = llamada.respuesta_ia.trim();
  const pbxCallId           = llamada.pbx_call_id.trim();

  // ── Paso 2: Marcar la llamada como TTS en proceso ─────────────────────────
  // Solo marcamos DESPUÉS de los FAIL-FAST para no dejar tts_estado = 'procesando'
  // en llamadas que nunca van a ser procesadas (usuario colgó, etc.)
  await prisma.llamadas.update({
    where: { id: llamada_id, empresa_id: empresaId }, // MULTI-TENANT
    data:  { tts_estado: 'procesando' }
  });

  // ── Paso 3: Resolver provider TTS via AIProviderFactory ───────────────────
  const { provider: tts, voz, modelo } = await AIProviderFactory.getProvider(
    empresaId,
    'tts'
  );

  // ── Paso 4: Sintetizar texto a audio ─────────────────────────────────────
  // synthesize() retorna audio ya resampleado a 8kHz, 16-bit, Mono, PCM WAV
  // (conversión via ffmpeg aplicada internamente en OpenAITTSProvider).
  // El buffer está listo para subirse directamente a CloudUCM.
  console.log(
    `[TTS Job][${WORKER_ID}] 🔊 Sintetizando ${textoParaSintetizar.length} chars ` +
    `(voz: ${voz}, modelo: ${modelo})...`
  );

  const ttsResult = await tts.synthesize(
    textoParaSintetizar,
    { voz, modelo }
  );

  if (!ttsResult.success) {
    throw new Error(ttsResult.message);
  }

  const { audio_buffer, formato, caracteres } = ttsResult.data;

  console.log(
    `[TTS Job][${WORKER_ID}] ✅ Audio sintetizado | ` +
    `${caracteres} chars | ${audio_buffer.length} bytes | formato: ${formato}`
  );

  // ── Paso 5: Interacción con CloudUCM (Bina 3) ─────────────────────────────
  //
  // INSTANCIACIÓN POR JOB (tenant isolation):
  //   Cada job crea su propia instancia de CloudUCMProvider.
  //   La clase almacena sesión en this.cookie y this.baseUrl.
  //   Al instanciar por job, garantizamos que nunca se mezclen sesiones
  //   entre empresas distintas en un entorno multi-tenant.
  //   _ensureSession(empresaId) se encarga de autenticar con MD5 challenge
  //   la primera vez y renovar la sesión si expiró (30 min TTL).
  const ucmProvider = new CloudUCMProvider();

  // Nombre de archivo único para el prompt: tts-{llamada_id}-{timestamp}.wav
  // El timestamp garantiza que dos llamadas del mismo día no se sobreescriban.
  const filename = `tts-${llamada_id}-${Date.now()}.wav`;

  // 5a. Subir el audio al UCM como Custom Prompt IVR
  console.log(`[TTS Job][${WORKER_ID}] ⬆ Subiendo prompt '${filename}' al UCM...`);
  await ucmProvider.uploadPrompt(empresaId, filename, audio_buffer);

  // 5b. Reproducir el prompt en el canal activo de la llamada
  console.log(
    `[TTS Job][${WORKER_ID}] ▶ Reproduciendo '${filename}' ` +
    `en canal ${pbxCallId}...`
  );
  await ucmProvider.playPrompt(empresaId, pbxCallId, filename);

  // ── Paso 6: Registrar consumo financiero ──────────────────────────────────
  // Para TTS: tokensEntrada = caracteres (convención Bina #4)
  //   costo = (caracteres / 1_000_000) × PRICE_OPENAI_TTS_PER_1M_CHARS × (1 + margen)
  await AIProviderFactory.registrarConsumo({
    empresaId,
    llamadaId:     llamada_id,
    proveedorId:   proveedor_id ?? null,
    tipo:          'tts',
    tokensEntrada: caracteres,   // Convención TTS: caracteres como "tokens de entrada"
    tokensSalida:  0,            // TTS no produce tokens de salida
    duracionSeg:   0,
    caracteres
  });

  // ── Paso 7: Actualizar tts_estado en la llamada ────────────────────────────
  await prisma.llamadas.update({
    where: { id: llamada_id, empresa_id: empresaId }, // MULTI-TENANT
    data:  { tts_estado: 'completado' }
  });

  // ── Paso 8: Cerrar el job ─────────────────────────────────────────────────
  await _marcarCompletado(jobId, empresaId);

  console.log(`[TTS Job][${WORKER_ID}] ✔ Job ${jobId} completado | llamada: ${llamada_id}`);

  // ── Paso 9: Emitir evento WebSocket ───────────────────────────────────────
  // El frontend escucha 'tts_completado' para confirmar que el audio
  // fue reproducido en la llamada — útil para dashboards de supervisión.
  SocketService.emit(
    `empresa:${empresaId}`,
    'tts_completado',
    {
      llamada_id,
      filename,
      caracteres,
      voz,
      timestamp: new Date().toISOString()
    }
  );
}

// ─── Ciclo de Sondeo del Worker ───────────────────────────────────────────────

let _isRunning = false;
let _pollTimer = null;

async function _cicloSondeo() {
  if (_isRunning) return;
  _isRunning = true;

  try {
    await _liberarJobsHuerfanos();

    let procesados = 0;
    let job;

    while (
      procesados < CONFIG.MAX_JOBS_POR_CICLO &&
      (job = await _tomarSiguienteJob()) !== null
    ) {
      try {
        await _procesarJob(job);
      } catch (error) {
        const llamadaId = job.payload?.llamada_id ?? null;
        await _manejarFalloJob(job, error.message ?? 'Error desconocido', llamadaId);
      }
      procesados++;
    }

  } catch (error) {
    console.error(
      `[TTS Job][${WORKER_ID}] 💥 Error crítico en ciclo de sondeo: ${error.message}`
    );
  } finally {
    _isRunning = false;
  }
}

// ─── API Pública del Worker ───────────────────────────────────────────────────

function iniciar() {
  if (_pollTimer) {
    console.warn(`[TTS Job][${WORKER_ID}] El worker ya está en ejecución.`);
    return;
  }
  console.log(
    `[TTS Job][${WORKER_ID}] 🚀 Worker TTS iniciado. ` +
    `Intervalo: ${CONFIG.POLL_INTERVAL_MS}ms | ` +
    `Max jobs/ciclo: ${CONFIG.MAX_JOBS_POR_CICLO}`
  );
  _cicloSondeo();
  _pollTimer = setInterval(_cicloSondeo, CONFIG.POLL_INTERVAL_MS);
}

function detener() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
    console.log(`[TTS Job][${WORKER_ID}] 🛑 Worker TTS detenido.`);
  }
}

// ─── Gestión del Ciclo de Vida del Proceso ───────────────────────────────────

process.on('SIGTERM', () => {
  console.log(`[TTS Job][${WORKER_ID}] SIGTERM recibido → deteniendo worker...`);
  detener();
});

process.on('SIGINT', () => {
  console.log(`[TTS Job][${WORKER_ID}] SIGINT recibido → deteniendo worker...`);
  detener();
  process.exit(0);
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { iniciar, detener };
