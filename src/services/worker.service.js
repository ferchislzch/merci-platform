/**
 * worker.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestor Central de Workers — Arquitectura Híbrida
 *
 * ESTRATEGIA:
 *   Este archivo orquesta DOS tipos de workers con ciclos de vida distintos:
 *
 *   1. DESPACHADOR CENTRAL (heredado — Binas 2 y 3):
 *      Usa un único setInterval (tick) que consulta jobs_async y los despacha
 *      a handlers por tipo. Workers: workflowTrigger, ticketAuto, grabacionFetch.
 *
 *   2. DAEMONS AUTÓNOMOS IA (Bina 4):
 *      Cada worker gestiona su propio ciclo interno con SELECT FOR UPDATE
 *      SKIP LOCKED atómico. Workers: sttProceso, llmProceso, ttsProceso.
 *      Se inician/detienen explícitamente via .iniciar() / .detener().
 *
 * POR QUÉ EL STT NO ESTÁ EN HANDLERS:
 *   sttProceso fue migrado a Daemon Autónomo porque:
 *   · Requiere SELECT FOR UPDATE SKIP LOCKED atómico (no soportado por el
 *     dispatcher genérico sin transacción explícita)
 *   · Implementa locking multi-instancia con worker_id y locked_at
 *   · Gestiona descarga de audio CloudUCM (recapi), reintento autónomo y
 *     self-chaining hacia llmProceso → ttsProceso
 *
 * USO EN server.js:
 *   const workerService = require('./services/worker.service')
 *   workerService.start()   // Al arrancar
 *   workerService.stop()    // En graceful shutdown (SIGTERM / SIGINT)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const prisma = require('../config/database')
const env    = require('../config/env')

// ─── Handlers: Despachador Central (Binas 2 y 3) ────────────────────────────
// INTACTO — no modificar sin coordinación con los equipos propietarios.

const workflowTrigger = require('../jobs/workflowTrigger.job')
const ticketAuto      = require('../jobs/ticketAuto.job')
const grabacionFetch  = require('../jobs/grabacionFetch.job')

// ─── Daemons Autónomos IA (Bina 4) ──────────────────────────────────────────
// Exportan { iniciar, detener } — NO usan el dispatcher genérico.

const sttWorker = require('../jobs/sttProceso.job')
const llmWorker = require('../jobs/llmProceso.job')
const ttsWorker = require('../jobs/ttsProceso.job')

// ─── Mapa tipo de job → handler (Despachador Central) ────────────────────────
// NOTA: 'stt_proceso' fue eliminado — ahora es un Daemon Autónomo (ver arriba).
// Los tres tipos del pipeline IA ('transcribir_audio', 'procesar_llm',
// 'procesar_tts') son consumidos directamente por sus daemons, no por este mapa.

const HANDLERS = {
    workflow_trigger: workflowTrigger.handle,
    ticket_auto:      ticketAuto.handle,
    grabacion_fetch:  grabacionFetch.handle,
}

let intervalo = null
let corriendo = false

// ─── Despachador Central — lógica INTACTA ────────────────────────────────────

/**
 * Obtiene y bloquea un lote de jobs pendientes.
 * Usa SELECT FOR UPDATE SKIP LOCKED para evitar procesamiento
 * duplicado cuando haya múltiples instancias del servidor.
 */
const obtenerJobs = async (batchSize) => {
    const ahora = new Date()
    const tipos = Object.keys(HANDLERS) // ['workflow_trigger','ticket_auto','grabacion_fetch']
    const jobs = await prisma.$queryRaw`
        SELECT id, empresa_id, tipo, payload, intentos, max_intentos
        FROM jobs_async
        WHERE status = 'pendiente'
        AND tipo = ANY(${tipos})
        AND fecha_programada <= ${ahora}
        ORDER BY fecha_programada ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
    `
    return jobs
}
/**
 * Procesa un job individual.
 */
const procesarJob = async (job) => {
    const handler = HANDLERS[job.tipo]

    // Marcar como procesando
    await prisma.jobs_async.update({
        where: { id: job.id },
        data: {
            status:       'procesando',
            fecha_inicio: new Date(),
            intentos:     { increment: 1 },
        },
    })

    try {
        if (!handler) {
            throw new Error(`No existe handler para el tipo de job: ${job.tipo}`)
        }

        // Ejecutar el handler con el payload del job
        await handler(job.payload, job.empresa_id)

        // Marcar como completado
        await prisma.jobs_async.update({
            where: { id: job.id },
            data: {
                status:    'completado',
                fecha_fin: new Date(),
            },
        })
    } catch (err) {
        console.error(`[worker] Error procesando job ${job.id} (${job.tipo}):`, err.message)

        const agotado = job.intentos >= job.max_intentos

        // Si agotó los intentos → error definitivo
        // Si no → vuelve a pendiente para reintento
        await prisma.jobs_async.update({
            where: { id: job.id },
            data: {
                status:        agotado ? 'error' : 'pendiente',
                error_detalle: err.message,
                fecha_fin:     agotado ? new Date() : null,
            },
        })
    }
}

/**
 * Ciclo principal del Despachador Central.
 * Se ejecuta cada WORKER_POLL_INTERVAL_MS milisegundos.
 */
const tick = async () => {
    if (corriendo) return // Evita solapamiento si el tick anterior tardó más

    corriendo = true
    try {
        const batchSize = parseInt(env.WORKER_BATCH_SIZE)
        const jobs      = await obtenerJobs(batchSize)

        if (jobs.length > 0) {
            // Procesar jobs en paralelo dentro del batch
            await Promise.allSettled(jobs.map(procesarJob))
        }
    } catch (err) {
        console.error('[worker] Error en tick:', err.message)
    } finally {
        corriendo = false
    }
}

// ─── API Pública ──────────────────────────────────────────────────────────────

/**
 * Inicia el sistema completo de workers.
 *
 * 1. Arranca el Despachador Central (setInterval → tick)
 *    para workflowTrigger, ticketAuto, grabacionFetch.
 *
 * 2. Arranca los Daemons Autónomos IA de Bina 4:
 *    sttProceso, llmProceso, ttsProceso (cada uno con su
 *    propio ciclo interno y SELECT FOR UPDATE SKIP LOCKED).
 *
 * Se llama desde server.js al arrancar el servidor.
 */
const start = () => {
    const intervaloMs = parseInt(env.WORKER_POLL_INTERVAL_MS)

    // — Despachador Central (Binas 2 y 3) —
    console.log(`[worker] Despachador central iniciado — polling cada ${intervaloMs}ms`)
    intervalo = setInterval(tick, intervaloMs)

    // — Daemons Autónomos IA (Bina 4) —
    sttWorker.iniciar()
    llmWorker.iniciar()
    ttsWorker.iniciar()
}

/**
 * Detiene el sistema completo de workers limpiamente.
 *
 * 1. Detiene el Despachador Central (clearInterval).
 * 2. Detiene los Daemons Autónomos IA (cada uno para su ciclo interno).
 *
 * Se llama al apagar el servidor (SIGTERM / SIGINT).
 * No interrumpe jobs en curso — solo cancela el scheduling futuro.
 */
const stop = () => {
    // — Despachador Central —
    if (intervalo) {
        clearInterval(intervalo)
        console.log('[worker] Despachador central detenido')
    }

    // — Daemons Autónomos IA (Bina 4) —
    ttsWorker.detener()
    llmWorker.detener()
    sttWorker.detener()
}

module.exports = { start, stop }