/**
 * sttProceso.job.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Worker Asíncrono: Procesamiento STT (Speech-To-Text)
 * Ruta oficial: src/jobs/sttProceso.job.js
 * Bina #4 — Johann & Kevin
 *
 * RESPONSABILIDADES:
 *   1. Sondear jobs_async buscando jobs de tipo 'transcribir_audio'
 *   2. Tomar un job de forma atómica con SELECT FOR UPDATE SKIP LOCKED
 *   3. Descargar el audio desde CloudUCM via la API 'recapi'
 *   4. Obtener el provider STT via AIProviderFactory (abstracción multi-proveedor)
 *   5. Transcribir el audio con el provider resuelto
 *   6. Actualizar: llamadas, consumo_ia, auditorias_comandos_ia, jobs_async
 *   7. Emitir evento WebSocket 'stt_completado' para actualización en tiempo real
 *
 * CONCURRENCIA:
 *   SELECT FOR UPDATE SKIP LOCKED via $queryRaw — Prisma no soporta esto nativamente.
 *   worker_id y locked_at se gestionan exclusivamente via SQL raw.
 *
 * PATRÓN FACTORY:
 *   Este worker NO instancia providers de IA directamente. Toda la resolución de
 *   credenciales e instanciación del cliente OpenAI es responsabilidad de
 *   AIProviderFactory, lo que permite cambiar de proveedor STT sin tocar este archivo.
 *
 * DESCARGA CLOUDUCM:
 *   Los archivos de grabación en CloudUCM NO son públicos. Se descargan mediante
 *   la acción 'recapi' de la HTTPS API del UCM, que requiere autenticación via
 *   session cookie (token). Ver sección CloudUCM API en la documentación del proyecto.
 *   Referencia: IPPBX-HTTPS-API-Documentation-Center.pdf → sección "recapi"
 *
 * ESTRUCTURA ESPERADA DEL PAYLOAD EN jobs_async:
 * {
 *   "llamada_id":     "uuid-de-la-llamada",
 *   "audio_filename": "auto-1574857256-1003-1004.wav",  ← nombre del archivo en UCM
 *   "audio_filedir":  "monitor",                        ← directorio en UCM (default: "monitor")
 *   "proveedor_id":   "uuid-de-openai-whisper-en-catalogo_proveedores_ia"
 * }
 *
 * AISLAMIENTO MULTI-TENANT:
 *   Toda consulta a Prisma incluye empresa_id en el WHERE.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const prisma            = require('../config/database');
const AIProviderFactory = require('../providers/AIProviderFactory');
const { URL }           = require('url');

// ─── TODO [Bina 1]: WebSocket Service ────────────────────────────────────────
//
// Reemplazar este stub con la instancia real de Socket.io cuando Bina 1
// exponga el módulo. Coordinar la ruta de importación exacta.
//
// Uso esperado en producción:
//   const { io } = require('../socket');           // opción A
//   const SocketService = require('../services/socket.service'); // opción B
//
// El evento debe emitirse a la sala de la empresa para aislamiento multi-tenant:
//   io.to(`empresa:${empresaId}`).emit('stt_completado', payload);
//
const SocketService = {
  /**
   * Emite un evento a todos los clientes conectados a la sala indicada.
   * @param {string} sala    - Identificador de sala (ej: 'empresa:<uuid>')
   * @param {string} evento  - Nombre del evento WebSocket
   * @param {Object} payload - Datos a enviar al frontend
   */
  emit: (sala, evento, payload) => {
    // STUB: En producción, este método llama a io.to(sala).emit(evento, payload)
    console.log(`[SocketService STUB] → sala: '${sala}' | evento: '${evento}'`, payload);
  }
};

// ─── Identidad y Configuración del Worker ─────────────────────────────────────

/**
 * Identificador único de esta instancia del worker.
 * PID + timestamp garantizan unicidad en entornos multi-proceso.
 */
const WORKER_ID = `stt-worker-pid${process.pid}-${Date.now()}`;

const CONFIG = {
  POLL_INTERVAL_MS:   5_000,  // Frecuencia de sondeo: cada 5 segundos
  MAX_JOBS_POR_CICLO: 5,      // Máximo de jobs a procesar por ciclo
  JOB_TIPO:          'transcribir_audio',
  LOCK_TIMEOUT_MIN:   10,     // Minutos para considerar un job como huérfano
  UCM_FILEDIR_DEFAULT: 'monitor', // Directorio CloudUCM por defecto para grabaciones
};

// ─── Descarga de Audio desde CloudUCM ────────────────────────────────────────

/**
 * Descarga un archivo de grabación desde CloudUCM usando la acción 'recapi'
 * de la HTTPS API del UCM. Los archivos de grabación NO son accesibles
 * públicamente — requieren autenticación via session cookie.
 *
 * CLOUDUCM HTTPS API — Acción recapi (descarga local):
 *   POST https://<ucm_host>:<puerto>/api
 *   Content-Type: application/json
 *   Body:
 *   {
 *     "request": {
 *       "action":   "recapi",
 *       "cookie":   "<session_token>",   ← token de sesión activo
 *       "filedir":  "monitor",           ← "monitor" | "queue" | "voicemail"
 *       "filename": "auto-XXXXX-XXXX-XXXX.wav"
 *     }
 *   }
 *
 * RESPUESTA EXITOSA:
 *   El UCM retorna el binario del archivo de audio directamente en el body
 *   de la respuesta HTTP (Content-Type: audio/wav o application/octet-stream).
 *   Si la autenticación falla, retorna JSON con código de error.
 *
 * CREDENCIALES CLOUDUCM:
 *   Se leen de configuraciones_empresa.credenciales_cloudUCM (campo JSONB).
 *   Estructura esperada del JSONB:
 *   {
 *     "ucm_host":  "192.168.1.100",   ← IP o hostname del UCM en la red
 *     "ucm_port":  8089,              ← Puerto HTTPS de la API (default: 8089)
 *     "ucm_token": "sid173710538-..." ← Session token activo (gestión: Bina 3)
 *   }
 *
 * TODO [Bina 3]: Confirmar:
 *   1. Nombre exacto del campo en configuraciones_empresa (¿credenciales_cloudUCM?)
 *   2. Mecanismo de renovación automática del session token (expira periódicamente)
 *   3. Si el UCM usa certificado auto-firmado, agregar: { rejectUnauthorized: false }
 *      al fetch (solo para entornos internos/desarrollo — no en producción pública)
 *
 * @param {string} empresaId    - UUID de la empresa (multi-tenant)
 * @param {string} audioFilename - Nombre del archivo de grabación en el UCM
 * @param {string} [audioFiledir] - Directorio del archivo en el UCM
 * @returns {Promise<Buffer>} Buffer binario del archivo de audio
 */
async function _descargarAudioCloudUCM(empresaId, audioFilename, audioFiledir) {
  const filedir = audioFiledir ?? CONFIG.UCM_FILEDIR_DEFAULT;

  // — Obtener credenciales CloudUCM de configuraciones_empresa —
  // TODO [Bina 3]: Confirmar nombre del campo en configuraciones_empresa
  const config = await prisma.configuraciones_empresa.findUnique({
    where:  { empresa_id: empresaId },
    select: { credenciales_cloudUCM: true }  // ← nombre tentativo, confirmar con Bina 3
  });

  if (!config?.credenciales_cloudUCM) {
    throw new Error(
      `Empresa ${empresaId} no tiene credenciales CloudUCM configuradas. ` +
      `Verifica configuraciones_empresa.credenciales_cloudUCM`
    );
  }

  const { ucm_host, ucm_port = 8089, ucm_token } = config.credenciales_cloudUCM;

  if (!ucm_host || !ucm_token) {
    throw new Error(
      `Credenciales CloudUCM incompletas para empresa ${empresaId}. ` +
      `Se requieren: ucm_host, ucm_token. Recibido: ${JSON.stringify(config.credenciales_cloudUCM)}`
    );
  }

  const ucmApiUrl = `https://${ucm_host}:${ucm_port}/api`;

  console.log(
    `[STT Job][${WORKER_ID}] ⬇ Descargando grabación '${audioFilename}' ` +
    `(dir: ${filedir}) desde ${ucmApiUrl}`
  );

  // — Llamada a la HTTPS API del UCM: acción recapi —
  const respuesta = await fetch(ucmApiUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    // TODO [Bina 3]: Si el UCM usa certificado auto-firmado agregar:
    //   agent: new (require('https').Agent)({ rejectUnauthorized: false })
    body: JSON.stringify({
      request: {
        action:   'recapi',
        cookie:   ucm_token,
        filedir,
        filename: audioFilename
      }
    })
  });

  if (!respuesta.ok) {
    throw new Error(
      `CloudUCM recapi respondió con HTTP ${respuesta.status} para el archivo ` +
      `'${audioFilename}'. Verifica que el token de sesión sea válido.`
    );
  }

  // Verificar que la respuesta no sea un JSON de error del UCM
  // (el UCM retorna JSON en errores de autenticación aunque el HTTP sea 200)
  const contentType = respuesta.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const errorBody = await respuesta.json();
    throw new Error(
      `CloudUCM recapi retornó error JSON para '${audioFilename}': ` +
      JSON.stringify(errorBody)
    );
  }

  // La respuesta exitosa es el binario del archivo de audio
  const arrayBuffer = await respuesta.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  if (audioBuffer.length === 0) {
    throw new Error(
      `CloudUCM retornó un buffer de audio vacío para el archivo '${audioFilename}'. ` +
      `Verifica que el archivo exista en el UCM en el directorio '${filedir}'.`
    );
  }

  return audioBuffer;
}

// ─── Operaciones de Cola (raw SQL obligatorio) ────────────────────────────────

/**
 * Toma el siguiente job disponible de forma atómica.
 *
 * PATRÓN SELECT FOR UPDATE SKIP LOCKED:
 *   · Atómico: SELECT + UPDATE en una sola sentencia SQL
 *   · SKIP LOCKED: otras instancias del worker omiten este job sin bloquearse
 *   · RETURNING: devuelve los valores DESPUÉS del UPDATE
 *
 * @returns {Promise<Object|null>} El job tomado, o null si la cola está vacía
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
 * Libera jobs huérfanos (workers caídos que no liberaron su lock).
 * Los regresa a 'pendiente' para reintento por otro worker.
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
 * Maneja el fallo de un job decidiendo si reintentar o marcar como error definitivo.
 *
 * · intentos < max_intentos → regresa a 'pendiente' (otro ciclo lo reintentará)
 * · intentos >= max_intentos → marca 'error' (fin del ciclo de vida del job)
 */
async function _manejarFalloJob(job, mensajeError, llamadaId) {
  const { id: jobId, empresa_id: empresaId, intentos, max_intentos } = job;
  const agotado = intentos >= max_intentos;

  console.error(
    `[STT Job][${WORKER_ID}] ❌ Error en job ${jobId} ` +
    `(intento ${intentos}/${max_intentos}): ${mensajeError}`
  );

  // Revertir stt_estado de la llamada para que no quede bloqueada en 'procesando'
  if (llamadaId) {
    try {
      await prisma.llamadas.update({
        where: { id: llamadaId, empresa_id: empresaId }, // MULTI-TENANT
        data:  { stt_estado: 'error' }
      });
    } catch (updateErr) {
      console.warn(
        `[STT Job][${WORKER_ID}] No se pudo revertir stt_estado ` +
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
      `[STT Job][${WORKER_ID}] Job ${jobId} agotó ${max_intentos} intentos → 'error'.`
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
      `[STT Job][${WORKER_ID}] Job ${jobId} regresado a 'pendiente' para reintento.`
    );
  }
}

// ─── Procesamiento Principal del Job ─────────────────────────────────────────

/**
 * Procesa un job de transcripción STT de principio a fin.
 *
 * Pipeline:
 *   1. Marcar llamada como STT en proceso
 *   2. Descargar audio desde CloudUCM (recapi)
 *   3. Resolver provider STT via AIProviderFactory
 *   4. Transcribir con Whisper
 *   5. Actualizar llamada con transcripción
 *   6. Registrar consumo_ia
 *   7. Registrar auditorias_comandos_ia
 *   8. Cerrar job + emitir evento WebSocket
 *
 * @param {Object} job - Registro de jobs_async tomado con SKIP LOCKED
 */
async function _procesarJob(job) {
  const {
    id:         jobId,
    empresa_id: empresaId,
    payload
  } = job;

  // Extraer y validar el payload del job
  // audio_filename: nombre del archivo en CloudUCM (ej: "auto-1574857256-1003-1004.wav")
  // audio_filedir:  directorio en CloudUCM (ej: "monitor"). Default: CONFIG.UCM_FILEDIR_DEFAULT
  const { llamada_id, audio_filename, audio_filedir, proveedor_id } = payload ?? {};

  if (!llamada_id || !audio_filename) {
    throw new Error(
      `Payload inválido en job ${jobId}. ` +
      `Campos requeridos: 'llamada_id', 'audio_filename'. ` +
      `Recibido: ${JSON.stringify(payload)}`
    );
  }

  console.log(`[STT Job][${WORKER_ID}] ▶ Iniciando job ${jobId} | llamada: ${llamada_id}`);

  // ── Paso 1: Marcar la llamada como STT en proceso ─────────────────────────
  await prisma.llamadas.update({
    where: { id: llamada_id, empresa_id: empresaId }, // AISLAMIENTO MULTI-TENANT
    data:  { stt_estado: 'procesando' }
  });

  // ── Paso 2: Descargar el audio desde CloudUCM via recapi ─────────────────
  const audioBuffer   = await _descargarAudioCloudUCM(empresaId, audio_filename, audio_filedir);
  const nombreArchivo = audio_filename; // Preservamos el nombre original para el MIME type

  // ── Paso 3: Resolver el provider STT via AIProviderFactory ───────────────
  //
  // AIProviderFactory es el único punto de entrada para obtener providers de IA.
  // Internamente maneja: lectura de credenciales de configuraciones_empresa,
  // instanciación del cliente OpenAI, caché por empresa, y selección de proveedor.
  //
  // Retorna: { provider: WhisperSTTProvider, idioma: 'es' }
  const { provider: whisper, idioma } = await AIProviderFactory.getProvider(empresaId, 'stt');

  // ── Paso 4: Transcribir con Whisper ──────────────────────────────────────
  console.log(`[STT Job][${WORKER_ID}] 🎙 Transcribiendo con Whisper (idioma: ${idioma})...`);

  // NOTA: duracionSeg ya NO se pasa — WhisperSTTProvider usa verbose_json
  // para obtener la duración exacta directamente de la respuesta de OpenAI.
  const sttResult = await whisper.transcribir({
    audio:        audioBuffer,
    idioma,
    nombreArchivo
  });

  if (!sttResult.success) {
    throw new Error(sttResult.message);
  }

  const { transcripcion, duracion_seg, tokens_entrada, tokens_salida, costo_estimado } = sttResult.data;

  console.log(
    `[STT Job][${WORKER_ID}] ✅ Transcripción OK | ` +
    `${duracion_seg}s de audio | costo: $${costo_estimado} USD`
  );

  // ── Paso 5: Actualizar la llamada con la transcripción ───────────────────
  await prisma.llamadas.update({
    where: { id: llamada_id, empresa_id: empresaId }, // AISLAMIENTO MULTI-TENANT
    data:  {
      transcripcion,
      stt_estado:       'completado',
      stt_proveedor_id: proveedor_id ?? null
    }
  });

  // ── Paso 6: Registrar consumo IA ─────────────────────────────────────────
  //
  // CONVENCIÓN STT (Bina #4):
  //   tokens_entrada = duración del audio en SEGUNDOS (verbose_json → response.duration)
  //   tokens_salida  = 0 (Whisper no tiene tokens de salida)
  //   costo_estimado = (segundos / 60) × $0.006 USD/min
  await prisma.consumo_ia.create({
    data: {
      empresa_id:    empresaId,
      llamada_id:    llamada_id,
      proveedor_id:  proveedor_id ?? null,
      tokens_entrada, // CONVENCIÓN: segundos de audio (obtenidos de verbose_json)
      tokens_salida,  // Siempre 0
      costo_estimado
    }
  });

  // ── Paso 7: Registrar auditoría del comando de voz ───────────────────────
  //
  // usuario_id es NULL: en llamadas de clientes telefónicos externos no existe
  // un usuario del sistema autenticado. El campo es opcional en auditorias_comandos_ia.
  await prisma.auditorias_comandos_ia.create({
    data: {
      empresa_id:        empresaId,
      usuario_id:        null,
      llamada_id:        llamada_id,
      comando_voz_puro:  transcripcion,
      json_deducido:     null,           // Lo llenará el módulo LLM (otro Bina)
      tokens_consumidos: tokens_entrada, // Consistente con convención STT
      status_resultado:  'exitoso',
      respuesta_hardware: null
    }
  });

  // ── Paso 8: Cerrar el job como completado ────────────────────────────────
  await _marcarCompletado(jobId, empresaId);

  console.log(`[STT Job][${WORKER_ID}] ✔ Job ${jobId} completado | llamada: ${llamada_id}`);

  // ── Paso 9: Emitir evento WebSocket para actualización en tiempo real ─────
  //
  // El frontend (Dashboard) escucha 'stt_completado' en la sala de su empresa
  // para actualizar la vista de la llamada sin requerir un polling manual.
  //
  // TODO [Bina 1]: Reemplazar SocketService.emit con la implementación real
  // de Socket.io una vez que el módulo esté disponible. Ver comentario en la
  // sección de imports al inicio de este archivo.
  SocketService.emit(
    `empresa:${empresaId}`,  // Sala de la empresa — aislamiento multi-tenant en sockets
    'stt_completado',
    {
      llamada_id,
      transcripcion,
      duracion_seg,
      costo_estimado,
      timestamp: new Date().toISOString()
    }
  );
}

// ─── Ciclo de Sondeo del Worker ───────────────────────────────────────────────

let _isRunning  = false;
let _pollTimer  = null;

/**
 * Ejecuta un ciclo completo:
 *   1. Libera jobs huérfanos
 *   2. Toma y procesa hasta MAX_JOBS_POR_CICLO jobs en secuencia
 */
async function _cicloSondeo() {
  if (_isRunning) return; // Evitar solapamiento de ciclos
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
      `[STT Job][${WORKER_ID}] 💥 Error crítico en ciclo de sondeo: ${error.message}`
    );
  } finally {
    _isRunning = false;
  }
}

// ─── API Pública del Worker ───────────────────────────────────────────────────

function iniciar() {
  if (_pollTimer) {
    console.warn(`[STT Job][${WORKER_ID}] El worker ya está en ejecución.`);
    return;
  }
  console.log(
    `[STT Job][${WORKER_ID}] 🚀 Worker STT iniciado. ` +
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
    console.log(`[STT Job][${WORKER_ID}] 🛑 Worker STT detenido.`);
  }
}

// ─── Gestión del Ciclo de Vida del Proceso ───────────────────────────────────

process.on('SIGTERM', () => {
  console.log(`[STT Job][${WORKER_ID}] SIGTERM recibido → deteniendo worker...`);
  detener();
});

process.on('SIGINT', () => {
  console.log(`[STT Job][${WORKER_ID}] SIGINT recibido → deteniendo worker...`);
  detener();
  process.exit(0);
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { iniciar, detener };