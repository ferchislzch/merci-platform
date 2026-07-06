// src/modules/webhooks/webhooks.repository.js
// Bina 3 — CloudUCM, Llamadas y PBX
// Acceso directo a BD para eventos de webhook.
// MULTI-TENANT: empresa_id siempre presente — la empresa se resuelve
//               desde el numero_destino del payload, NO de req.user.

'use strict';

const prisma = require('../../config/database');

/**
 * Guarda el payload RAW exacto que llegó de CloudUCM.
 * SIEMPRE se llama ANTES de cualquier procesamiento.
 * Si el procesamiento posterior falla, la evidencia ya quedó guardada.
 *
 * NOTA: id es BIGSERIAL (BigInt en Prisma). Se convierte a String
 *       al devolver para evitar pérdida de precisión en JSON.
 *
 * @param {Object} params
 * @param {string} params.empresaId   - UUID de la empresa resuelta
 * @param {string|null} params.pbxId  - UUID de configuraciones_pbx (puede ser null)
 * @param {string} params.tipo        - Valor de body.event o 'desconocido'
 * @param {Object} params.headers     - req.headers completo
 * @param {Object} params.payload     - req.body completo
 * @returns {Promise<Object>}         - Fila creada (id como String)
 */
async function guardarEventoRaw({ empresaId, pbxId, tipo, headers, payload }) {
  const evento = await prisma.pbx_eventos_raw.create({
    data: {
      empresa_id: empresaId,
      pbx_id:     pbxId || null,
      tipo:       tipo  || 'desconocido',
      headers:    headers,
      payload:    payload,
      procesado:  false
    }
  });
  // BigInt → String para serialización JSON segura
  return { ...evento, id: evento.id.toString() };
}

/**
 * Marca un evento raw como procesado exitosamente.
 * Se llama al final del procesamiento, después de que todo salió bien.
 *
 * @param {string} id - id del evento (String que viene de guardarEventoRaw)
 * @returns {Promise<Object>}
 */
async function marcarEventoProcesado(id) {
  const actualizado = await prisma.pbx_eventos_raw.update({
    where:  { id: BigInt(id) },
    data:   { procesado: true }
  });
  return { ...actualizado, id: actualizado.id.toString() };
}

/**
 * Busca el agente virtual asociado a un número de destino.
 * Este es el mecanismo que permite resolver la empresa sin un usuario logueado.
 * CloudUCM manda a qué número llegó la llamada → buscamos qué agente
 * tiene ese número_entrada → obtenemos empresa_id.
 *
 * @param {string} numeroDestino - Número de teléfono al que llegó la llamada
 * @returns {Promise<Object|null>}
 */
async function buscarAgentePorNumero(numeroDestino) {
  return prisma.agentes_virtuales.findFirst({
    where: {
      numero_entrada: numeroDestino,
      deleted_at:     null
    },
    select: {
      id:         true,
      empresa_id: true,
      nombre:     true,
      pbx_ivr_id: true
    }
  });
}

/**
 * Busca la configuración PBX activa de una empresa.
 * Se usa para obtener el pbx_id que se guarda en pbx_eventos_raw.
 *
 * @param {string} empresaId
 * @returns {Promise<Object|null>}
 */
async function buscarConfigPbxActiva(empresaId) {
  return prisma.configuraciones_pbx.findFirst({
    where: {
      empresa_id: empresaId,
      activo:     true,
      deleted_at: null
    },
    select: { id: true }
  });
}

module.exports = {
  guardarEventoRaw,
  marcarEventoProcesado,
  buscarAgentePorNumero,
  buscarConfigPbxActiva
};