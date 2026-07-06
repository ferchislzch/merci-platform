// src/modules/configuracion/pbx.service.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// SOBRE probar-conexion:
// Llama a CloudUCMProvider.connect(empresaId) que hace el handshake completo
// (challenge MD5 + login) contra el CloudUCM del cliente.
// No guarda nada nuevo — es solo una prueba en vivo.
// NO reimplementar el login MD5. Ese detalle de orden del hash
// (md5(challenge + password), en ese orden) ya costó tiempo descubrirlo
// y está resuelto dentro de CloudUCMProvider.

'use strict';

const pbxRepository    = require('./pbx.repository');
const CloudUCMProvider = require('../../services/pbx/CloudUCMProvider');
const NotFoundError    = require('../../core/errors/NotFoundError');
const AppError         = require('../../core/errors/AppError');

/**
 * Obtiene la configuración PBX de la empresa del usuario actual.
 *
 * @param {string} empresaId
 * @returns {Promise<Object>}
 * @throws {NotFoundError} - Si la empresa no tiene configuración PBX
 */
async function obtenerConfigPbx(empresaId) {
  const config = await pbxRepository.obtenerConfigPbx(empresaId);
  if (!config) {
    throw new NotFoundError('Configuración PBX para esta empresa');
  }
  return config;
}

/**
 * Crea o actualiza la configuración PBX de la empresa.
 * Si ya existe una configuración, la actualiza. Si no existe, la crea.
 *
 * @param {string} empresaId
 * @param {Object} datos
 * @param {string} datos.apiUrl       - URL de la API de CloudUCM
 * @param {string} datos.apiUsuario   - Usuario de autenticación
 * @param {Object} datos.credenciales - { password: '...' } o el formato que use el cliente
 * @param {string} [datos.proveedor]  - 'grandstream' por default
 * @param {string} [datos.authTipo]   - 'md5_token' por default
 * @param {boolean} [datos.activo]    - true por default
 * @returns {Promise<Object>}
 */
async function guardarConfigPbx(empresaId, datos) {
  // Verificar si ya existe configuración para esta empresa
  const existente = await pbxRepository.obtenerConfigPbx(empresaId);

  if (existente) {
    return pbxRepository.actualizarConfigPbx(empresaId, existente.id, datos);
  } else {
    return pbxRepository.crearConfigPbx(empresaId, datos);
  }
}

/**
 * Prueba la conexión con el CloudUCM usando las credenciales guardadas.
 * Hace el handshake completo (autenticación MD5 de dos pasos) sin guardar
 * ningún cambio en la BD — es solo un test en vivo.
 *
 * IMPORTANTE: Si CloudUCMProvider.connect() devuelve vacío en getRecording(),
 * eso NO es un bug — las grabaciones están deshabilitadas en este cliente.
 * Ver sección 4 de la guía para el detalle.
 *
 * @param {string} empresaId
 * @returns {Promise<Object>} - { conectado: true, mensaje: '...' }
 * @throws {NotFoundError} - Si no hay configuración guardada
 * @throws {AppError}      - Si la conexión falla
 */
async function probarConexion(empresaId) {
  // Verificar que existe la configuración antes de intentar conectar
  const config = await pbxRepository._obtenerConfigConCredenciales(empresaId);
  if (!config) {
    throw new NotFoundError('Configuración PBX. Configure la conexión antes de probarla');
  }

  try {
    // CloudUCMProvider es una clase — hay que instanciarla antes de llamar connect().
    // connect() ya lee las credenciales desde la BD internamente, no hay que pasarlas.
    const pbxInstance = new CloudUCMProvider();
    await pbxInstance.connect(empresaId);

    // Si connect() no lanzó error, la conexión fue exitosa
    return {
      conectado: true,
      proveedor: config.proveedor,
      apiUrl:    config.api_url,
      mensaje:   'Conexión establecida con CloudUCM exitosamente'
    };

  } catch (errorConexion) {
    // La conexión falló — devolvemos el error controlado, no el raw de CloudUCM
    throw new AppError(
      `No se pudo conectar con CloudUCM: ${errorConexion.message}`,
      502
    );
  }
}

module.exports = {
  obtenerConfigPbx,
  guardarConfigPbx,
  probarConexion
};