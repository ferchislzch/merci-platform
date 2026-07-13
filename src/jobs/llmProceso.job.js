/**
 * llmProceso.job.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Worker Asíncrono: Procesamiento LLM (Large Language Model)
 * Ruta oficial: src/jobs/llmProceso.job.js
 * Bina #4 — Johann & Kevin
 *
 * RESPONSABILIDADES:
 *   1. Sondear jobs_async buscando jobs de tipo 'procesar_llm'
 *   2. Tomar un job de forma atómica con SELECT FOR UPDATE SKIP LOCKED
 *   3. Extraer transcripcion de llamadas (promptUser)
 *   4. Obtener promptSystem desde versiones_prompt (FAIL-FAST si no existe)
 *   5. Construir historial multi-turno desde auditorias_comandos_ia
 *   6. Resolver provider LLM via AIProviderFactory
 *   7. Ejecutar provider.chat() con prompt + historial + config
 *   8. Persistir consumo via AIProviderFactory.registrarConsumo()
 *   9. Actualizar llamadas (respuesta_ia, llm_estado)
 *  10. Insertar en auditorias_comandos_ia (incluyendo respuesta_ia_puro)
 *  11. Cerrar job + emitir WebSocket 'llm_completado'
 *
 * POLÍTICA FAIL-FAST (ALERTA 3):
 *   Si llamadas.agente_id es NULL, o si no existe versiones_prompt con
 *   es_activa = true para ese agente, el job falla con error descriptivo.
 *   NO se usa prompt genérico de fallback. El administrador debe corregir
 *   la configuración del agente virtual en el PBX.
 *
 * HISTORIAL MULTI-TURNO:
 *   Se reconstruye desde auditorias_comandos_ia filtrando por llamada_id
 *   y ordenando por fecha_ejecucion ASC. Cada registro aporta:
 *     · comando_voz_puro  → { role: 'user',      content: ... }
 *     · respuesta_ia_puro → { role: 'assistant', content: ... }
 *   El turno actual (transcripcion de esta llamada) NO se incluye en el
 *   historial — va como promptUser directo al método chat().
 *
 * ESTRUCTURA ESPERADA DEL PAYLOAD EN jobs_async:
 * {
 *   "llamada_id":   "uuid-de-la-llamada",
 *   "proveedor_id": "uuid-de-openai-gpt4o-en-catalogo_proveedores_ia"
 * }
 *
 * CONCURRENCIA:
 *   SELECT FOR UPDATE SKIP LOCKED via $queryRaw — Prisma no soporta esto nativamente.
 *   worker_id y locked_at se gestionan exclusivamente via raw SQL.
 *
 * AISLAMIENTO MULTI-TENANT:
 *   Toda consulta a Prisma incluye empresa_id en el WHERE.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const prisma            = require('../config/database');
const AIProviderFactory = require('../providers/AIProviderFactory');

// ─── TODO [Bina 1]: WebSocket Service ────────────────────────────────────────
// Reemplazar este stub con la instancia real de Socket.io.
// Coordinar ruta de importación con Bina 1 (mismo patrón que sttProceso.job.js).
// En producción: io.to(`empresa:${empresaId}`).emit(evento, payload)
const SocketService = {
  emit: (sala, evento, payload) => {
    console.log(`[SocketService STUB] → sala: '${sala}' | evento: '${evento}'`, payload);
  }
};

// ─── Identidad y Configuración del Worker ─────────────────────────────────────

const WORKER_ID = `llm-worker-pid${process.pid}-${Date.now()}`;

const CONFIG = {
  POLL_INTERVAL_MS:    5_000,
  MAX_JOBS_POR_CICLO:  5,
  JOB_TIPO:           'procesar_llm',
  LOCK_TIMEOUT_MIN:    10,
};

// ─── Operaciones de Cola (raw SQL obligatorio) ────────────────────────────────

/**
 * Toma el siguiente job disponible de forma atómica.
 * Patrón SELECT FOR UPDATE SKIP LOCKED — atómico, sin race conditions.
 *
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
 * Revierte llm_estado a 'error' en la llamada asociada.
 *
 * @param {Object} job
 * @param {string} mensajeError
 * @param {string|null} llamadaId
 */
async function _manejarFalloJob(job, mensajeError, llamadaId) {
  const { id: jobId, empresa_id: empresaId, intentos, max_intentos } = job;
  const agotado = intentos >= max_intentos;

  console.error(
    `[LLM Job][${WORKER_ID}] ❌ Error en job ${jobId} ` +
    `(intento ${intentos}/${max_intentos}): ${mensajeError}`
  );

  // Revertir llm_estado para que la llamada no quede bloqueada en 'procesando'
  if (llamadaId) {
    try {
      await prisma.llamadas.update({
        where: { id: llamadaId, empresa_id: empresaId },
        data:  { llm_estado: 'error' }
      });
    } catch (updateErr) {
      console.warn(
        `[LLM Job][${WORKER_ID}] No se pudo revertir llm_estado ` +
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
      `[LLM Job][${WORKER_ID}] Job ${jobId} agotó ${max_intentos} intentos → 'error'.`
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
      `[LLM Job][${WORKER_ID}] Job ${jobId} regresado a 'pendiente' para reintento.`
    );
  }
}

// ─── Lógica de Contexto ───────────────────────────────────────────────────────

/**
 * Obtiene el prompt del sistema (system prompt) desde versiones_prompt.
 *
 * FAIL-FAST (Alerta 3):
 *   · Si la llamada no tiene agente_id  → Error descriptivo
 *   · Si no hay prompt activo para el agente → Error descriptivo
 *   NO se usa prompt genérico de fallback. La configuración incorrecta
 *   del agente debe corregirse en el panel de administración.
 *
 * @param {Object} llamada  - Registro de la tabla llamadas
 * @param {string} empresaId
 * @returns {Promise<string>} El texto del system prompt activo
 * @throws {Error} Si no hay agente_id o no hay prompt activo
 */
async function _obtenerPromptSystem(llamada, empresaId) {
  if (!llamada.agente_id) {
    throw new Error(
      `[LLM Job] La llamada ${llamada.id} no tiene agente_id asignado. ` +
      `Un agente virtual debe estar vinculado a la llamada para que el LLM ` +
      `sepa cómo comportarse. Corrige la configuración en el PBX o en el ` +
      `módulo de agentes virtuales.`
    );
  }

  // versiones_prompt tiene un @@unique con WHERE es_activa = true,
  // garantizando que como máximo existe un prompt activo por agente.
  const promptActivo = await prisma.versiones_prompt.findFirst({
    where: {
      agente_virtual_id: llamada.agente_id,
      es_activa:         true
    },
    select: { prompt: true, version: true }
  });

  if (!promptActivo) {
    throw new Error(
      `[LLM Job] El agente virtual ${llamada.agente_id} no tiene ningún ` +
      `prompt activo (es_activa = true) en versiones_prompt. ` +
      `Activa una versión de prompt desde el panel de administración ` +
      `antes de procesar llamadas con este agente.`
    );
  }

  console.info(
    `[LLM Job][${WORKER_ID}] Prompt activo v${promptActivo.version} ` +
    `para agente ${llamada.agente_id} (${promptActivo.prompt.length} chars)`
  );

  return promptActivo.prompt;
}

/**
 * Construye el array de historial multi-turno desde auditorias_comandos_ia.
 *
 * ESTRATEGIA (Alerta 2):
 *   Consultamos los registros ANTERIORES de auditorias_comandos_ia para
 *   la misma llamada_id, ordenados cronológicamente ASC. Cada registro
 *   puede aportar hasta dos mensajes al historial:
 *     1. comando_voz_puro  → { role: 'user',      content: ... }
 *     2. respuesta_ia_puro → { role: 'assistant', content: ... }
 *
 *   El turno ACTUAL (transcripcion de este job) NO se incluye aquí — va
 *   como promptUser directo a provider.chat() para evitar duplicación.
 *
 *   Si la llamada es el primer turno, retorna [] (array vacío).
 *
 * NOTA: El campo de ordenación es fecha_ejecucion (nombre real en el schema).
 *   El brief mencionaba "fecha_creacion", pero el campo real en el schema
 *   y en la BD es fecha_ejecucion. Se usa este para garantizar orden correcto.
 *
 * @param {string} llamadaId  - UUID de la llamada actual
 * @param {string} empresaId  - Para aislamiento multi-tenant
 * @param {string} turnoActualId - ID del registro ACTUAL de auditoria (excluirlo del historial)
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
async function _construirHistorial(llamadaId, empresaId, turnoActualId) {
  const registrosPrevios = await prisma.auditorias_comandos_ia.findMany({
    where: {
      llamada_id: llamadaId,
      empresa_id: empresaId, // AISLAMIENTO MULTI-TENANT
      // Excluir el turno actual si ya fue insertado previamente
      ...(turnoActualId ? { NOT: { id: BigInt(turnoActualId) } } : {})
    },
    orderBy: { fecha_ejecucion: 'asc' },
    select: {
      comando_voz_puro:  true,
      respuesta_ia_puro: true
    }
  });

  const historial = [];

  for (const registro of registrosPrevios) {
    // Turno del usuario (lo que dijo el cliente)
    if (registro.comando_voz_puro?.trim()) {
      historial.push({ role: 'user', content: registro.comando_voz_puro.trim() });
    }
    // Turno del asistente (lo que respondió el LLM en ese turno)
    if (registro.respuesta_ia_puro?.trim()) {
      historial.push({ role: 'assistant', content: registro.respuesta_ia_puro.trim() });
    }
  }

  if (historial.length > 0) {
    console.info(
      `[LLM Job][${WORKER_ID}] Historial cargado: ${historial.length} mensajes ` +
      `(${registrosPrevios.length} turnos previos) para llamada ${llamadaId}`
    );
  }

  return historial;
}

// ─── Procesamiento Principal del Job ─────────────────────────────────────────

/**
 * Procesa un job de generación de respuesta LLM de principio a fin.
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

  console.log(`[LLM Job][${WORKER_ID}] ▶ Iniciando job ${jobId} | llamada: ${llamada_id}`);

  // ── Paso 1: Marcar la llamada como LLM en proceso ──────────────────────────
  await prisma.llamadas.update({
    where: { id: llamada_id, empresa_id: empresaId }, // MULTI-TENANT
    data:  { llm_estado: 'procesando' }
  });

  // ── Paso 2: Leer la llamada con la transcripción (promptUser) ──────────────
  const llamada = await prisma.llamadas.findUnique({
    where:  { id: llamada_id, empresa_id: empresaId }, // MULTI-TENANT
    select: {
      id:           true,
      empresa_id:   true,
      agente_id:    true,
      transcripcion: true
    }
  });

  if (!llamada) {
    throw new Error(
      `[LLM Job] Llamada ${llamada_id} no encontrada para empresa ${empresaId}. ` +
      `Verifica que el job apunte a una llamada válida y del mismo tenant.`
    );
  }

  if (!llamada.transcripcion?.trim()) {
    throw new Error(
      `[LLM Job] La llamada ${llamada_id} no tiene transcripcion. ` +
      `El Worker STT debe completarse antes de encolar el job LLM. ` +
      `Revisa el orden de ejecución del pipeline.`
    );
  }

  const promptUser = llamada.transcripcion.trim();

  // ── Paso 3: Obtener promptSystem (FAIL-FAST si no existe) ─────────────────
  const promptSystem = await _obtenerPromptSystem(llamada, empresaId);

  // ── Paso 4: Construir historial multi-turno ────────────────────────────────
  // Recuperamos turnos PREVIOS de esta llamada para dar contexto al LLM.
  // El turno actual (promptUser) se pasa separado, no dentro del historial.
  const historial = await _construirHistorial(llamada_id, empresaId, null);

  // ── Paso 5: Resolver provider LLM via AIProviderFactory ───────────────────
  const {
    provider: llm,
    modelo,
    temperatura,
    idioma
  } = await AIProviderFactory.getProvider(empresaId, 'llm');

  // ── Paso 6: Ejecutar el LLM ────────────────────────────────────────────────
  console.log(
    `[LLM Job][${WORKER_ID}] 🤖 Llamando al LLM ` +
    `(modelo: ${modelo}, temperatura: ${temperatura}, ` +
    `historial: ${historial.length} msgs)...`
  );

  const llmResult = await llm.chat({
    promptSystem,
    promptUser,
    historial,
    modelo,
    temperatura
    // maxTokens: usa el default de 150 (IVR conversacional)
    // Sobreescribir si el contexto lo requiere: maxTokens: 300
  });

  if (!llmResult.success) {
    throw new Error(llmResult.message);
  }

  const {
    texto_generado,
    tokens_entrada,
    tokens_salida,
    modelo_usado
  } = llmResult.data;

  console.log(
    `[LLM Job][${WORKER_ID}] ✅ LLM OK | ` +
    `modelo: ${modelo_usado} | ` +
    `tokens in/out: ${tokens_entrada}/${tokens_salida}`
  );

  // ── Paso 7: Registrar consumo financiero ───────────────────────────────────
  // AIProviderFactory.registrarConsumo calcula el costo con el margen MERCI
  // y persiste en consumo_ia. Para LLM los "tokens" son reales (no segundos).
  await AIProviderFactory.registrarConsumo({
    empresaId,
    llamadaId:    llamada_id,
    proveedorId:  proveedor_id ?? null,
    tipo:         'llm',
    tokensEntrada: tokens_entrada,
    tokensSalida:  tokens_salida,
    duracionSeg:   0,
    caracteres:    0
  });

  // ── Paso 8: Actualizar la llamada con la respuesta del LLM ────────────────
  await prisma.llamadas.update({
    where: { id: llamada_id, empresa_id: empresaId }, // MULTI-TENANT
    data: {
      respuesta_ia: texto_generado,
      llm_estado:   'completado'
    }
  });

  // ── Paso 9: Registrar en auditorias_comandos_ia ───────────────────────────
  //
  // Guardamos TANTO el comando del usuario (transcripcion / promptUser) COMO
  // la respuesta del LLM (respuesta_ia_puro) en el mismo registro.
  // Esto habilita la reconstrucción del historial multi-turno en futuras
  // llamadas del mismo cliente/agente dentro de la misma llamada.
  //
  // NOTA: usuario_id es NULL — la llamada es de un cliente externo sin
  // usuario del sistema autenticado. Ver nota en sttProceso.job.js.
  await prisma.auditorias_comandos_ia.create({
    data: {
      empresa_id:        empresaId,
      usuario_id:        null,
      llamada_id:        llamada_id,
      comando_voz_puro:  promptUser,         // Lo que dijo el cliente (STT)
      respuesta_ia_puro: texto_generado,     // Lo que respondió el LLM
      json_deducido:     {                   // Metadatos para trazabilidad
        modelo_usado,
        tokens_entrada,
        tokens_salida,
        historial_length: historial.length
      },
      tokens_consumidos: tokens_entrada + tokens_salida,
      status_resultado:  'exitoso',
      respuesta_hardware: null
    }
  });

  // ── Paso 10: Cerrar el job como completado ────────────────────────────────
  await _marcarCompletado(jobId, empresaId);

  console.log(`[LLM Job][${WORKER_ID}] ✔ Job ${jobId} completado | llamada: ${llamada_id}`);

  // ── Paso 11: Emitir evento WebSocket ─────────────────────────────────────
  // El frontend (Dashboard) escucha 'llm_completado' para mostrar la
  // respuesta del agente en tiempo real sin polling manual.
  SocketService.emit(
    `empresa:${empresaId}`,
    'llm_completado',
    {
      llamada_id,
      texto_generado,
      modelo_usado,
      tokens_entrada,
      tokens_salida,
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
      `[LLM Job][${WORKER_ID}] 💥 Error crítico en ciclo de sondeo: ${error.message}`
    );
  } finally {
    _isRunning = false;
  }
}

// ─── API Pública del Worker ───────────────────────────────────────────────────

function iniciar() {
  if (_pollTimer) {
    console.warn(`[LLM Job][${WORKER_ID}] El worker ya está en ejecución.`);
    return;
  }
  console.log(
    `[LLM Job][${WORKER_ID}] 🚀 Worker LLM iniciado. ` +
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
    console.log(`[LLM Job][${WORKER_ID}] 🛑 Worker LLM detenido.`);
  }
}

// ─── Gestión del Ciclo de Vida del Proceso ───────────────────────────────────

process.on('SIGTERM', () => {
  console.log(`[LLM Job][${WORKER_ID}] SIGTERM recibido → deteniendo worker...`);
  detener();
});

process.on('SIGINT', () => {
  console.log(`[LLM Job][${WORKER_ID}] SIGINT recibido → deteniendo worker...`);
  detener();
  process.exit(0);
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { iniciar, detener };