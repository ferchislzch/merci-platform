/**
 * ticketAuto.job.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Job: Crear un ticket automáticamente desde el pipeline de IA
 * Ruta oficial: src/jobs/ticketAuto.job.js
 * Bina #4 — Johann & Kevin
 *
 * PAYLOAD ESPERADO:
 *   { llamadaId: string, motivo: string, prioridad?: string }
 *
 * FLUJO:
 *   1. Validar payload
 *   2. Verificar que la llamada existe y pertenece a la empresa (multi-tenant)
 *   3. Resolver UUID de prioridad desde catalogo_prioridad_ticket
 *   4. Resolver UUID del estado inicial desde catalogo_estado_ticket
 *   5. Crear el ticket
 *   6. Log de confirmación (WebSocket — pendiente de integración con Bina 1)
 *
 * DECISIONES TÉCNICAS — IMPORTANTE LEER:
 *
 *   El schema real de 'tickets' NO tiene campos de texto para prioridad u origen.
 *   Usa FKs UUID a tablas de catálogo:
 *     prioridad_ticket_id → catalogo_prioridad_ticket.id
 *     estado_ticket_id    → catalogo_estado_ticket.id
 *   El payload llega con el nombre textual ('media', 'alta', etc.) y este job
 *   lo resuelve al UUID correspondiente mediante una consulta al catálogo.
 *
 *   Si el catálogo no tiene el valor solicitado, el error se propaga — el worker
 *   lo registra. Esta es la señal para que el administrador configure el catálogo.
 *
 * PENDIENTES DE CONFIRMAR (con responsable del módulo de tickets):
 *   1. Nombre exacto del estado inicial en catalogo_estado_ticket
 *      (este job asume 'abierto' o 'pendiente' como posibles valores)
 *   2. Valores válidos en catalogo_prioridad_ticket ('media', 'alta', 'baja', etc.)
 *   3. Si usuario_responsable_id puede quedar null en creación automática
 *   4. Ruta exacta de websocketService para emitir el evento de ticket creado
 *
 * POLÍTICA DE ERRORES:
 *   Los errores se propagan sin capturarse. El worker registra el fallo
 *   y reintenta según max_intentos del job.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const prisma = require('../config/database');
const { NotFoundError } = require('../core/errors');

// ─── Helpers de resolución de catálogos ──────────────────────────────────────

/**
 * Resuelve el UUID de una prioridad de ticket por nombre.
 *
 * La búsqueda es case-insensitive para tolerar variaciones en el payload
 * ('media', 'Media', 'MEDIA' → mismo UUID).
 *
 * @param {string} nombrePrioridad - Nombre textual de la prioridad
 * @returns {Promise<string|null>} UUID del catálogo o null si no existe
 */
async function resolverPrioridadId(nombrePrioridad) {
  const entrada = await prisma.catalogo_prioridad_ticket.findFirst({
    where: {
      nombre:     { equals: nombrePrioridad, mode: 'insensitive' },
      deleted_at: null
    },
    select: { id: true }
  });
  return entrada?.id ?? null;
}

/**
 * Resuelve el UUID del estado inicial para un ticket recién creado.
 *
 * TODO [módulo tickets]: Confirmar con el responsable cuál es el nombre
 * exacto del estado inicial. Este job busca por los nombres más comunes.
 * Si el catálogo usa un nombre diferente, agregar aquí.
 *
 * @returns {Promise<string|null>} UUID del estado inicial o null si no se encuentra
 */
async function resolverEstadoInicialId() {
  const estadosIniciales = ['abierto', 'Abierto', 'pendiente', 'Pendiente', 'nuevo', 'Nuevo'];
  const entrada = await prisma.catalogo_estado_ticket.findFirst({
    where: {
      nombre:     { in: estadosIniciales },
      deleted_at: null
    },
    orderBy: { nombre: 'asc' },
    select:  { id: true, nombre: true }
  });
  return entrada?.id ?? null;
}

// ─── Handler principal ────────────────────────────────────────────────────────

/**
 * Crea un ticket automáticamente cuando el workflow de IA lo indica.
 *
 * @param {{ llamadaId: string, motivo: string, prioridad?: string }} payload
 * @param {string} empresaId - UUID de la empresa (multi-tenant)
 */
const handle = async (payload, empresaId) => {
  const { llamadaId, motivo, prioridad = 'media' } = payload ?? {};

  // Validar campos obligatorios del payload
  if (!llamadaId || !motivo) {
    throw new Error(
      `[ticketAuto] Payload incompleto. ` +
      `Requeridos: llamadaId, motivo. ` +
      `Recibido: ${JSON.stringify(payload)}`
    );
  }

  // Verificar que la llamada existe y pertenece a esta empresa (multi-tenant)
  const llamada = await prisma.llamadas.findFirst({
    where: {
      id:         llamadaId,
      empresa_id: empresaId    // AISLAMIENTO MULTI-TENANT
    },
    select: { id: true, cliente_id: true }
  });

  if (!llamada) {
    throw new NotFoundError(
      `Llamada ${llamadaId} no encontrada para empresa ${empresaId}.`
    );
  }

  // Resolver UUIDs del catálogo en paralelo — tickets usa FKs, no strings directos
  const [prioridadId, estadoInicialId] = await Promise.all([
    resolverPrioridadId(prioridad),
    resolverEstadoInicialId()
  ]);

  // Prioridad es requerida — si no existe en catálogo, es un error de configuración
  if (!prioridadId) {
    throw new Error(
      `[ticketAuto] Prioridad '${prioridad}' no encontrada en catalogo_prioridad_ticket ` +
      `para empresa ${empresaId}. ` +
      `Verificar con el responsable del módulo de tickets los valores válidos del catálogo.`
    );
  }

  // Estado inicial — opcional (puede quedar null si el catálogo no está configurado)
  if (!estadoInicialId) {
    console.warn(
      `[ticketAuto] No se encontró estado inicial en catalogo_estado_ticket. ` +
      `El ticket se creará sin estado. ` +
      `Configurar el catálogo con un valor inicial (ej: 'abierto').`
    );
  }

  // Crear el ticket
  // NOTA: 'titulo' es NOT NULL en el schema (VARCHAR 200) — se deriva del motivo.
  //        'descripcion' registra el contexto de creación automática.
  //        'usuario_responsable_id' queda null — sin asignar en creación automática.
  //        Confirmar con responsable del módulo si esto es válido en su flujo.
  const ticket = await prisma.tickets.create({
    data: {
      empresa_id:            empresaId,
      llamada_id:            llamadaId,
      cliente_id:            llamada.cliente_id ?? null,
      titulo:                motivo.slice(0, 200),   // VARCHAR(200) — truncar si excede
      descripcion:           `Ticket creado automáticamente por el pipeline de IA.\nMotivo: ${motivo}`,
      prioridad_ticket_id:   prioridadId,
      estado_ticket_id:      estadoInicialId ?? null,
      usuario_responsable_id: null    // sin asignar — confirmar con módulo tickets
    },
    select: { id: true, titulo: true }
  });

  // TODO [Bina 1]: Emitir evento WebSocket cuando el servicio esté disponible.
  // Ruta tentativa (confirmar con Bina 1):
  //   const websocketService = require('../services/websocket.service');
  //   websocketService.emitTicketCreated(empresaId, {
  //     ticketId:  ticket.id,
  //     llamadaId,
  //   });

  console.info(
    `[ticketAuto] ✅ Ticket creado: ${ticket.id} | ` +
    `empresa: ${empresaId} | llamada: ${llamadaId} | prioridad: ${prioridad}`
  );
};

module.exports = { handle };
