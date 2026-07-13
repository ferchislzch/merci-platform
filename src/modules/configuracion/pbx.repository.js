// src/modules/configuracion/pbx.repository.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// REGLA DE ORO: El campo `credenciales` (JSONB) de configuraciones_pbx
// NUNCA debe salir en la respuesta de un GET. Contiene contraseñas del PBX.
// Por eso los SELECT explícitos de este archivo excluyen ese campo siempre.
//
// El campo sí se lee internamente (por CloudUCMProvider al hacer el login),
// pero nunca se devuelve al cliente HTTP.

'use strict';

const prisma = require('../../config/database');

// Campos seguros para devolver al cliente (sin credenciales)
const SELECT_SEGURO = {
  id:                  true,
  empresa_id:          true,
  proveedor:           true,
  api_url:             true,
  api_usuario:         true,
  auth_tipo:           true,
  activo:              true,
  fecha_registro:      true,
  fecha_actualizacion: true
  // credenciales: false  ← OMITIDO A PROPÓSITO
};

/**
 * Obtiene la configuración PBX activa de una empresa.
 * Si la empresa no tiene configuración, devuelve null.
 * Los datos de credenciales NO están en el resultado.
 *
 * @param {string} empresaId
 * @returns {Promise<Object|null>}
 */
async function obtenerConfigPbx(empresaId) {
  return prisma.configuraciones_pbx.findFirst({
    where: {
      empresa_id: empresaId,
      deleted_at: null
    },
    select: SELECT_SEGURO
  });
}

/**
 * Crea la configuración PBX de una empresa (primera vez).
 * Las credenciales se guardan encriptadas en el campo JSONB.
 *
 * @param {string} empresaId
 * @param {Object} datos
 * @returns {Promise<Object>} - Sin credenciales en la respuesta
 */
async function crearConfigPbx(empresaId, datos) {
  const creado = await prisma.configuraciones_pbx.create({
    data: {
      empresa_id:  empresaId,
      proveedor:   datos.proveedor  || 'grandstream',
      api_url:     datos.apiUrl,
      api_usuario: datos.apiUsuario,
      auth_tipo:   datos.authTipo   || 'md5_token',
      credenciales: datos.credenciales,
      activo:      true
    }
  });

  // Devolver sin credenciales
  const { credenciales: _omitido, ...seguros } = creado;
  return seguros;
}

/**
 * Actualiza la configuración PBX de una empresa.
 * Si se manda credenciales nuevas, se reemplazan; si no se manda, no se tocan.
 *
 * @param {string} empresaId
 * @param {string} id - UUID del registro a actualizar
 * @param {Object} datos
 * @returns {Promise<Object>} - Sin credenciales en la respuesta
 */
async function actualizarConfigPbx(empresaId, id, datos) {
  const dataUpdate = {
    ...(datos.apiUrl      && { api_url:      datos.apiUrl      }),
    ...(datos.apiUsuario  && { api_usuario:  datos.apiUsuario  }),
    ...(datos.authTipo    && { auth_tipo:    datos.authTipo    }),
    ...(datos.proveedor   && { proveedor:    datos.proveedor   }),
    ...(datos.activo      !== undefined && { activo: datos.activo }),
    // Credenciales solo se actualizan si explícitamente se mandan
    ...(datos.credenciales && { credenciales: datos.credenciales })
  };

  const actualizado = await prisma.configuraciones_pbx.update({
    where: {
      id,
      empresa_id: empresaId  // Doble check de tenant en el where
    },
    data: dataUpdate
  });

  // Devolver sin credenciales
  const { credenciales: _omitido, ...seguros } = actualizado;
  return seguros;
}

/**
 * Busca la configuración PBX incluyendo credenciales.
 * USO INTERNO ÚNICAMENTE — solo para pasarle a CloudUCMProvider.
 * Jamás se devuelve este resultado directamente al cliente.
 *
 * @param {string} empresaId
 * @returns {Promise<Object|null>}
 */
async function _obtenerConfigConCredenciales(empresaId) {
  return prisma.configuraciones_pbx.findFirst({
    where: {
      empresa_id: empresaId,
      activo:     true,
      deleted_at: null
    }
  });
}

module.exports = {
  obtenerConfigPbx,
  crearConfigPbx,
  actualizarConfigPbx,
  _obtenerConfigConCredenciales
};