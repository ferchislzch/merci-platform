// src/modules/llamadas/llamadas.service.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// SOBRE EL WEBSOCKET:
// La tabla llamadas tiene el trigger tr_evento_nueva_llamada que escribe en
// eventos_tiempo_real automáticamente al insertar una fila. Pero ese trigger
// solo escribe en la BD — NO envía el evento por WebSocket a quien tenga
// el dashboard abierto en ese momento.
// Por eso SIEMPRE hay que llamar explícitamente a websocketService.emitCallStarted
// y websocketService.emitCallEnded. No escribir io.emit() directamente.
//
// SOBRE CloudUCMProvider:
// El archivo src/services/pbx/CloudUCMProvider.js ya está probado contra
// un CloudUCM real. Para hablar con el PBX se importa y se usa ese archivo.
// No crear un cliente HTTP propio, no reimplementar el login MD5.

'use strict';

const llamadasRepository = require('./llamadas.repository');
const websocketService   = require('../../services/websocket.service');
const CloudUCMProvider   = require('../../services/pbx/CloudUCMProvider');
const NotFoundError      = require('../../core/errors/NotFoundError');
const AppError           = require('../../core/errors/AppError');
const prisma             = require('../../config/database');

// CloudUCMProvider es una clase — se instancia una vez aquí (singleton por módulo).
// _ensureSession() dentro del provider renueva la cookie si expiró (30 min).
const cloudUCM = new CloudUCMProvider();

/**
 * Devuelve el listado paginado de llamadas de una empresa.
 *
 * @param {string} empresaId
 * @param {Object} query - Query params: pagina, limite, desde, hasta, estado
 * @returns {Promise<Object>}
 */
async function listarLlamadas(empresaId, query) {
  return llamadasRepository.listarLlamadas(empresaId, query);
}

/**
 * Devuelve el detalle completo de una llamada.
 *
 * @param {string} empresaId
 * @param {string} id
 * @returns {Promise<Object>}
 * @throws {NotFoundError} - Si la llamada no existe o no pertenece a la empresa
 */
async function obtenerDetalleLlamada(empresaId, id) {
  const llamada = await llamadasRepository.obtenerLlamadaPorId(empresaId, id);
  if (!llamada) {
    throw new NotFoundError('Llamada');
  }
  return llamada;
}

/**
 * Sincroniza el CDR (historial de llamadas) desde CloudUCM hacia MERCI.
 *
 * Flujo:
 *   1. Obtiene CDR desde CloudUCM (método ya construido y probado)
 *   2. Para cada registro, hace upsert en llamadas (empresa_id + pbx_call_id)
 *   3. Registra el resultado de la sincronización en sincronizaciones_pbx
 *   4. Emite WebSocket de actualización a dashboards abiertos
 *
 * Este endpoint es de uso manual (por un Admin). La sincronización
 * automática queda pendiente hasta tener callOrchestrator funcional.
 *
 * @param {string} empresaId
 * @param {Object} filtros - Parámetros opcionales de fecha para filtrar el CDR
 * @returns {Promise<Object>} - Resumen de la sincronización
 * @throws {Error} - Si CloudUCM no responde o la conexión falla
 */
async function sincronizarCDR(empresaId, filtros = {}) {
  const inicio = Date.now();

  // Buscar config PBX para tener el pbx_id para el log de sincronización
  const configPbx = await prisma.configuraciones_pbx.findFirst({
    where:  { empresa_id: empresaId, activo: true, deleted_at: null },
    select: { id: true }
  });

  let registrosSincronizados = 0;
  let errores = [];

  try {
    // Obtener CDR desde CloudUCM usando el provider ya construido
    const cdrData = await cloudUCM.getCDR(empresaId, filtros);

    // cdrData.registros puede ser:
    //   - un array directo de registros
    //   - un objeto { cdr_item: [...] } si CloudUCM devuelve cdr_root
    //   - [] si no hay registros
    const rawRegistros = cdrData?.registros || [];
    const listaRegistros = Array.isArray(rawRegistros)
      ? rawRegistros
      : Array.isArray(rawRegistros?.cdr_item)
        ? rawRegistros.cdr_item
        : rawRegistros?.cdr_item
          ? [rawRegistros.cdr_item]
          : [];

    // Upsert de cada registro del CDR
    for (const item of listaRegistros) {
      try {
        const pbxCallId = item.callid || item.id;
        if (!pbxCallId) continue;

        await llamadasRepository.upsertLlamada(
          empresaId,
          pbxCallId,
          // datosCreate — campos que se guardan al crear la llamada nueva
          {
            numero_origen:  item.calleridnum || item.src || null,
            numero_destino: item.dst || null,
            fecha_inicio:   item.start  ? new Date(item.start)  : null,
            fecha_fin:      item.end    ? new Date(item.end)    : null,
            duracion_seg:   item.duration ? Number(item.duration) : null,
            metadata:       item
          },
          // datosUpdate — si el pbx_call_id ya existe, actualizar solo estos campos
          {
            fecha_fin:    item.end      ? new Date(item.end)      : undefined,
            duracion_seg: item.duration ? Number(item.duration)   : undefined,
            metadata:     item
          }
        );

        registrosSincronizados++;
      } catch (errorItem) {
        errores.push({ pbxCallId: item.callid, error: errorItem.message });
      }
    }

    const duracionMs = Date.now() - inicio;
    const status     = errores.length === 0 ? 'exitosa'
                     : errores.length < listaRegistros.length ? 'parcial'
                     : 'error';

    // Registrar resultado de la sincronización
    await llamadasRepository.registrarSincronizacion({
      empresaId,
      pbxId:      configPbx?.id || null,
      endpoint:   'cdr',
      status,
      duracionMs,
      errores:    errores.length > 0 ? { items: errores } : null
    });

    return {
      status,
      registrosSincronizados,
      errores:    errores.length > 0 ? errores : undefined,
      duracionMs
    };

  } catch (errorGeneral) {
    const duracionMs = Date.now() - inicio;

    // Registrar el fallo completo de la sincronización
    await llamadasRepository.registrarSincronizacion({
      empresaId,
      pbxId:      configPbx?.id || null,
      endpoint:   'cdr',
      status:     'error',
      duracionMs,
      errores:    { mensaje: errorGeneral.message }
    });

    throw new AppError(
      `Error de conexión con CloudUCM al sincronizar CDR: ${errorGeneral.message}`,
      502
    );
  }
}

/**
 * Registra el inicio de una llamada desde un evento de webhook.
 * Llamado internamente desde webhooks.service cuando se confirme
 * el formato de CloudUCM (pendiente de prueba — ver sección 6 de la guía).
 *
 * @param {string} empresaId
 * @param {string} pbxCallId
 * @param {Object} datos
 * @returns {Promise<Object>}
 */
async function registrarInicio(empresaId, pbxCallId, datos) {
  const llamada = await llamadasRepository.upsertLlamada(
    empresaId,
    pbxCallId,
    { ...datos, fecha_inicio: datos.fecha_inicio || new Date() },
    { fecha_inicio: datos.fecha_inicio || new Date() }
  );

  // Notificar al dashboard por WebSocket
  // (el trigger tr_evento_nueva_llamada ya escribió en eventos_tiempo_real,
  //  pero el WebSocket hay que emitirlo explícitamente)
  websocketService.emitCallStarted(empresaId, {
    llamadaId:    llamada.id,
    pbxCallId:    llamada.pbx_call_id,
    numeroOrigen: llamada.numero_origen
  });

  return llamada;
}

/**
 * Registra el cierre de una llamada desde un evento de webhook.
 * Llamado internamente desde webhooks.service cuando se confirme
 * el formato de CloudUCM (pendiente de prueba — ver sección 6 de la guía).
 *
 * @param {string} empresaId
 * @param {string} pbxCallId
 * @param {Object} datos
 * @returns {Promise<Object>}
 */
async function registrarCierre(empresaId, pbxCallId, datos) {
  const llamada = await llamadasRepository.upsertLlamada(
    empresaId,
    pbxCallId,
    { ...datos, fecha_fin: datos.fecha_fin || new Date() },
    { ...datos, fecha_fin: datos.fecha_fin || new Date() }
  );

  // Notificar al dashboard por WebSocket
  websocketService.emitCallEnded(empresaId, {
    llamadaId:   llamada.id,
    duracionSeg: llamada.duracion_seg,
    resultado:   datos.resultadoNombre
  });

  return llamada;
}

module.exports = {
  listarLlamadas,
  obtenerDetalleLlamada,
  sincronizarCDR,
  registrarInicio,
  registrarCierre
};