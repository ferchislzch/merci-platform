// src/modules/llamadas/llamadas.repository.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// MULTI-TENANT: TODAS las queries incluyen empresa_id en el where.
// Sin ese filtro, una empresa podría ver o modificar llamadas de otra.
//
// SOBRE EL UPSERT:
// CloudUCM puede mandar el mismo evento más de una vez (reintenta hasta
// 3 veces si MERCI no responde en 2 segundos). Para no duplicar llamadas,
// se usa upsert en lugar de create.
//
// Requiere que schema.prisma tenga en el model llamadas:
//   @@unique([empresa_id, pbx_call_id])
// (La BD tiene un índice parcial WHERE pbx_call_id IS NOT NULL — el @@unique
//  en Prisma se agrega manualmente para habilitar el upsert por clave compuesta)

'use strict';

const prisma = require('../../config/database');

// Campos seguros para devolver en listado (sin datos sensibles ni relaciones pesadas)
const SELECT_LISTADO = {
  id:                    true,
  pbx_call_id:           true,
  numero_origen:         true,
  numero_destino:        true,
  fecha_inicio:          true,
  fecha_fin:             true,
  duracion_seg:          true,
  escalada_humano:       true,
  clasificacion_ia:      true,
  fecha_registro:        true,
  agentes_virtuales:     { select: { id: true, nombre: true } },
  catalogo_estado_llamada:    { select: { id: true, nombre: true } },
  catalogo_resultado_llamada: { select: { id: true, nombre: true } }
};

// Campos seguros para devolver en detalle (incluye transcripción y sentimiento)
const SELECT_DETALLE = {
  ...SELECT_LISTADO,
  transcripcion:         true,
  stt_estado:            true,
  metadata:              true,
  catalogo_sentimientos: { select: { id: true, nombre: true } },
  workflows:             { select: { id: true, nombre: true } }
};

/**
 * Lista llamadas de una empresa con paginación y filtros opcionales.
 *
 * @param {string} empresaId
 * @param {Object} filtros
 * @param {number} [filtros.pagina=1]
 * @param {number} [filtros.limite=20]
 * @param {string} [filtros.desde]  - ISO date string
 * @param {string} [filtros.hasta]  - ISO date string
 * @param {string} [filtros.estado] - nombre del estado (ej: 'Finalizada')
 * @returns {Promise<{total: number, pagina: number, limite: number, llamadas: Array}>}
 */
async function listarLlamadas(empresaId, filtros = {}) {
  const { pagina = 1, limite = 20, desde, hasta, estado } = filtros;
  const skip = (Number(pagina) - 1) * Number(limite);

  const where = {
    empresa_id: empresaId,
    ...(desde && { fecha_inicio: { gte: new Date(desde) } }),
    ...(hasta && { fecha_inicio: { lte: new Date(hasta) } }),
    ...(estado && {
      catalogo_estado_llamada: { nombre: estado }
    })
  };

  const [total, llamadas] = await Promise.all([
    prisma.llamadas.count({ where }),
    prisma.llamadas.findMany({
      where,
      select:   SELECT_LISTADO,
      orderBy:  { fecha_registro: 'desc' },
      skip,
      take:     Number(limite)
    })
  ]);

  return {
    total,
    pagina:  Number(pagina),
    limite:  Number(limite),
    llamadas
  };
}

/**
 * Obtiene el detalle completo de una llamada.
 * El filtro por empresa_id garantiza que no se pueda consultar
 * una llamada de otra empresa conociendo solo el id.
 *
 * @param {string} empresaId
 * @param {string} id - UUID de la llamada
 * @returns {Promise<Object|null>}
 */
async function obtenerLlamadaPorId(empresaId, id) {
  return prisma.llamadas.findFirst({
    where:  { id, empresa_id: empresaId },
    select: SELECT_DETALLE
  });
}

/**
 * Crea o actualiza una llamada usando pbx_call_id como clave natural.
 *
 * CloudUCM puede mandar el mismo evento varias veces — el upsert garantiza
 * que no se duplique la llamada aunque llegue el mismo pbx_call_id repetido.
 *
 * @param {string} empresaId
 * @param {string} pbxCallId - ID único de la llamada en CloudUCM
 * @param {Object} datosCreate - Campos para la creación inicial
 * @param {Object} datosUpdate - Campos que se actualizan en reintentos
 * @returns {Promise<Object>}
 */
async function upsertLlamada(empresaId, pbxCallId, datosCreate, datosUpdate) {
  const existente = await prisma.llamadas.findFirst({
    where: { empresa_id: empresaId, pbx_call_id: pbxCallId }
  });

  if (existente) {
    return prisma.llamadas.update({
      where: { id: existente.id },
      data: datosUpdate
    });
  }

  return prisma.llamadas.create({
    data: { empresa_id: empresaId, pbx_call_id: pbxCallId, ...datosCreate }
  });
}

/**
 * Registra el resultado de una sincronización contra CloudUCM.
 * Se llama tanto si la sync salió bien como si falló, para tener
 * el historial completo de intentos.
 *
 * @param {Object} datos
 * @param {string} datos.empresaId
 * @param {string|null} datos.pbxId
 * @param {string} datos.endpoint   - Nombre del endpoint sincronizado (ej: 'cdr')
 * @param {'exitosa'|'error'|'parcial'} datos.status
 * @param {number} datos.duracionMs - Duración real de la operación
 * @param {Object|null} datos.errores - Detalles si hubo errores parciales
 * @returns {Promise<Object>}
 */
async function registrarSincronizacion({ empresaId, pbxId, endpoint, status, duracionMs, errores }) {
  return prisma.sincronizaciones_pbx.create({
    data: {
      empresa_id:  empresaId,
      pbx_id:      pbxId || null,
      endpoint:    endpoint,
      status:      status,
      duracion_ms: duracionMs,
      errores:     errores || null
    }
  });
}

module.exports = {
  listarLlamadas,
  obtenerLlamadaPorId,
  upsertLlamada,
  registrarSincronizacion
};