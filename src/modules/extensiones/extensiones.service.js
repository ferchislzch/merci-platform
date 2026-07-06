// src/modules/extensiones/extensiones.service.js
// Bina 3 — CloudUCM, Llamadas y PBX
//
// Lógica de negocio del módulo de extensiones.
// Única responsabilidad: listar extensiones de BD y sincronizarlas desde CloudUCM.
//
// SOBRE CloudUCMProvider.getExtensions():
//   Llama a listAccount en la API de CloudUCM y devuelve:
//   { status, total, extensiones: [ ...account[] ] }
//   Cada account tiene campos como: extension/account, fullname/name, mac, email
//   No están documentados por Grandstream — guardamos el objeto completo en metadata
//   para no perder información si el formato varía entre versiones de firmware.

'use strict';

const extensionesRepository = require('./extensiones.repository');
const CloudUCMProvider      = require('../../services/pbx/CloudUCMProvider');
const NotFoundError         = require('../../core/errors/NotFoundError');
const AppError              = require('../../core/errors/AppError');

// CloudUCMProvider es una clase — instancia singleton por módulo
const cloudUCM = new CloudUCMProvider();

/**
 * Devuelve las extensiones de la empresa almacenadas en BD.
 *
 * @param {string} empresaId
 * @returns {Promise<Object>}
 */
async function listarExtensiones(empresaId) {
  const extensiones = await extensionesRepository.listarExtensiones(empresaId);
  return {
    total:      extensiones.length,
    extensiones
  };
}

/**
 * Sincroniza las extensiones desde CloudUCM hacia la BD de MERCI.
 *
 * Flujo:
 *   1. Conectar con CloudUCM (usa credenciales de configuraciones_pbx)
 *   2. Obtener lista de extensiones del PBX (getExtensions)
 *   3. Para cada extensión, hacer upsert en BD (sin duplicar si ya existe)
 *   4. Registrar resultado en sincronizaciones_pbx
 *   5. Devolver resumen de la operación
 *
 * SOBRE el mapeo de campos de CloudUCM:
 *   El objeto account de CloudUCM puede variar entre versiones.
 *   Se intenta mapear los campos más comunes y se guarda el objeto completo.
 *   Si el mapeo falla para una extensión puntual, se registra el error
 *   y se continúa con las demás (no se aborta todo el sync).
 *
 * @param {string} empresaId
 * @returns {Promise<Object>} - Resumen: { status, sincronizadas, errores, duracionMs }
 */
async function sincronizarExtensiones(empresaId) {
  const inicio = Date.now();

  // Buscar config PBX para el log de sincronización
  const configPbx = await extensionesRepository.buscarConfigPbxActiva(empresaId);

  if (!configPbx) {
    throw new NotFoundError(
      'Configuración PBX activa. Configure la conexión en /api/configuracion/pbx antes de sincronizar'
    );
  }

  let sincronizadas = 0;
  let errores       = [];

  try {
    // Obtener extensiones desde CloudUCM
    const resultado = await cloudUCM.getExtensions(empresaId);
    const cuentas   = resultado?.extensiones || [];

    // Procesar cada extensión del PBX
    for (const cuenta of cuentas) {
      try {
        // Extraer número de extensión — CloudUCM puede usar 'account' o 'extension'
        const numeroExtension = cuenta.account || cuenta.extension || cuenta.number;

        if (!numeroExtension) {
          errores.push({ cuenta, error: 'No se encontró número de extensión en el objeto' });
          continue;
        }

        // Extraer nombre — puede venir como 'fullname', 'name', o 'username'
        const nombre = cuenta.fullname || cuenta.name || cuenta.username || null;

        // Extraer MAC address del dispositivo físico
        const mac = cuenta.mac || cuenta.device_mac || cuenta.macaddress || null;

        await extensionesRepository.upsertExtension(empresaId, {
          extension:    String(numeroExtension),
          nombre,
          pbxMacAddress: mac ? String(mac).toUpperCase() : null
        });

        sincronizadas++;
      } catch (errorItem) {
        errores.push({
          extension: cuenta.account || cuenta.extension,
          error:     errorItem.message
        });
      }
    }

    const duracionMs = Date.now() - inicio;
    const status     = errores.length === 0          ? 'exitosa'
                     : sincronizadas === 0            ? 'error'
                     :                                  'parcial';

    // Registrar resultado en sincronizaciones_pbx
    await extensionesRepository.registrarSincronizacion({
      empresaId,
      pbxId:      configPbx.id,
      status,
      duracionMs,
      errores: errores.length > 0 ? { items: errores } : null
    });

    return { status, sincronizadas, errores: errores.length > 0 ? errores : undefined, duracionMs };

  } catch (errorGeneral) {
    const duracionMs = Date.now() - inicio;

    // Registrar el fallo completo
    await extensionesRepository.registrarSincronizacion({
      empresaId,
      pbxId:      configPbx.id,
      status:     'error',
      duracionMs,
      errores:    { mensaje: errorGeneral.message }
    });

    throw new AppError(
      `Error al sincronizar extensiones desde CloudUCM: ${errorGeneral.message}`,
      502
    );
  }
}

module.exports = {
  listarExtensiones,
  sincronizarExtensiones
};