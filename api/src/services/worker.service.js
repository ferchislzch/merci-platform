const prisma = require('../config/database')
const env = require('../config/env')

// Handlers — un archivo por tipo de job
const sttProceso = require('../jobs/sttProceso.job')
const workflowTrigger = require('../jobs/workflowTrigger.job')
const ticketAuto = require('../jobs/ticketAuto.job')
const grabacionFetch  = require('../jobs/grabacionFetch.job')

// Mapa tipo de job -> handler
const HANDLERS = {
    stt_proceso: sttProceso.handle,
    workflow_trigger: workflowTrigger.handle,
    ticket_auto: ticketAuto.handle,
    grabacion_fetch: grabacionFetch.handle,
}

let intervalo = null
let corriendo = false

/**
 * Obtiene y bloquea un lote de jobs pendientes
 * Usa SELECT FOR UPDATE SKIP LOCKED para evitar procesamiento
 * duplicado cuando haya múltiples instancias del servidor
 */
const obtenerJobs = async (batchSize) => {
    // Prisma no soporta FOR UPDATE SKIP LOCKED directamente
    // usamos $queryRaw para esta query crítica
    const ahora = new Date()
    const jobs = await prisma.$queryRaw`
        SELECT id, empresa_id, tipo, payload, intentos, max_intentos
        FROM jobs_async
        WHERE status = 'pendiente'
        AND fecha_programada <= ${ahora}
        ORDER BY fecha_programada ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
    `
    return jobs
}

/**
 * Procesa un job individual
 */
const procesarJob = async (job) => {
    const handler = HANDLERS[job.tipo]

    // Marcar como procesando
    await prisma.jobs_async.update({
        where: { id: job.id },
        data: {
        status: 'procesando',
        fecha_inicio: new Date(),
        intentos: { increment: 1 },
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
            status: 'completado',
            fecha_fin: new Date(),
        },
        })
    } catch (err) {
        console.error(`[worker] Error procesando job ${job.id} (${job.tipo}):`, err.message)

        const agotado = job.intentos >= job.max_intentos

        // Si agotó los intentos → error definitivo
        // Si no -> vuelve a pendiente para reintento
        await prisma.jobs_async.update({
        where: { id: job.id },
        data: {
            status: agotado ? 'error' : 'pendiente',
            error_detalle: err.message,
            fecha_fin: agotado ? new Date() : null,
        },
        })
    }
}

/**
 * Ciclo principal del worker
 * Se ejecuta cada WORKER_POLL_INTERVAL_MS milisegundos
 */
const tick = async () => {
    if (corriendo) return // Evita solapamiento si el tick anterior tardó más

    corriendo = true
    try {
        const batchSize = parseInt(env.WORKER_BATCH_SIZE)
        const jobs = await obtenerJobs(batchSize)

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

/**
 * Inicia el worker
 * Se llama desde server.js al arrancar el servidor
 */
const start = () => {
    const intervaloMs = parseInt(env.WORKER_POLL_INTERVAL_MS)
    console.log(`[worker] Iniciado — polling cada ${intervaloMs}ms`)
    intervalo = setInterval(tick, intervaloMs)
}

/**
 * Detiene el worker
 * Se llama al apagar el servidor (SIGTERM/SIGINT)
 */
const stop = () => {
    if (intervalo) {
        clearInterval(intervalo)
        console.log('[worker] Detenido')
    }
}

module.exports = { start, stop }