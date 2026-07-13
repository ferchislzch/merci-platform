// src/modules/extensiones/extensiones.repository.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// Única capa que habla con Prisma para el módulo de extensiones.
// MULTI-TENANT: empresa_id en TODOS los where — sin excepción.

'use strict';

const prisma = require('../../config/database');

// Campos seguros para devolver al cliente
const SELECT_EXTENSION = {
  id:                   true,
  empresa_id:           true,
  extension:            true,
  nombre:               true,
  pbx_mac_address:      true,
  estado_extension_id:  true,
  sucursal_id:          true,
  departamento_id:      true,
  deleted_at:           true,
  fecha_registro:       true,
  fecha_actualizacion:  true,
  catalogo_estado_extension: { select: { id: true, nombre: true } },
  sucursales:           { select: { id: true, nombre: true } },
  departamentos:        { select: { id: true, nombre: true } }
};

/**
 * Lista todas las extensiones activas de una empresa.
 *
 * @param {string} empresaId
 * @returns {Promise<Array>}
 */
async function listarExtensiones(empresaId) {
  return prisma.extensiones.findMany({
    where: {
      empresa_id: empresaId,
      deleted_at: null
    },
    select:  SELECT_EXTENSION,
    orderBy: { extension: 'asc' }
  });
}

/**
 * Crea o actualiza una extensión usando (empresa_id + extension) como clave natural.
 * Prisma expone el unique como empresa_id_extension.
 *
 * Se llama en cada iteración del sync para no duplicar extensiones
 * si el admin sincroniza más de una vez.
 *
 * @param {string} empresaId
 * @param {Object} datos
 * @param {string} datos.extension     - Número de extensión (ej: "1008")
 * @param {string} [datos.nombre]      - Nombre del titular
 * @param {string} [datos.pbxMacAddress] - MAC del dispositivo
 * @param {Object} [datos.metadata]    - Objeto completo de CloudUCM
 * @returns {Promise<Object>}
 */
async function upsertExtension(empresaId, datos) {
  return prisma.extensiones.upsert({
    where: {
      empresa_id_extension: {
        empresa_id: empresaId,
        extension:  datos.extension
      }
    },
    create: {
      empresa_id:      empresaId,
      extension:       datos.extension,
      nombre:          datos.nombre          || null,
      pbx_mac_address: datos.pbxMacAddress   || null
    },
    update: {
      nombre:              datos.nombre        || null,
      pbx_mac_address:     datos.pbxMacAddress || null,
      fecha_actualizacion: new Date()
    }
  });
}

/**
 * Registra el resultado de una sincronización de extensiones en sincronizaciones_pbx.
 * Se llama tanto si salió bien como si falló, para tener historial completo.
 *
 * @param {Object} datos
 * @param {string} datos.empresaId
 * @param {string|null} datos.pbxId
 * @param {'exitosa'|'error'|'parcial'} datos.status
 * @param {number} datos.duracionMs
 * @param {Object|null} datos.errores
 * @returns {Promise<Object>}
 */
async function registrarSincronizacion({ empresaId, pbxId, status, duracionMs, errores }) {
  return prisma.sincronizaciones_pbx.create({
    data: {
      empresa_id:  empresaId,
      pbx_id:      pbxId    || null,
      endpoint:    '/api/extensiones/sync',
      status,
      duracion_ms: duracionMs,
      errores:     errores   || null
    }
  });
}

/**
 * Busca la configuración PBX activa de la empresa.
 * Necesaria para obtener el pbx_id en el registro de sincronización.
 *
 * @param {string} empresaId
 * @returns {Promise<Object|null>}
 */
async function buscarConfigPbxActiva(empresaId) {
  return prisma.configuraciones_pbx.findFirst({
    where:  { empresa_id: empresaId, activo: true, deleted_at: null },
    select: { id: true }
  });
}

module.exports = {
  listarExtensiones,
  upsertExtension,
  registrarSincronizacion,
  buscarConfigPbxActiva
};