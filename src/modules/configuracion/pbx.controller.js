// src/modules/configuracion/pbx.controller.js
// Bina 3 — CloudUCM, Llamadas y PBX
// Capa HTTP del módulo de configuración PBX. Sin lógica de negocio.

'use strict';

const pbxService = require('./pbx.service');

/**
 * GET /api/configuracion/pbx
 * Obtiene la configuración PBX de la empresa del usuario logueado.
 * Las credenciales NO aparecen en la respuesta (manejado en el repository).
 */
async function obtenerConfig(req, res, next) {
  try {
    const config = await pbxService.obtenerConfigPbx(req.empresaId);

    return res.status(200).json({
      ok:      true,
      mensaje: 'Configuración PBX obtenida correctamente',
      data:    config
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/configuracion/pbx
 * Crea o actualiza la configuración PBX de la empresa.
 * Si no existe configuración previa, la crea. Si existe, la actualiza.
 *
 * Body esperado:
 * {
 *   "apiUrl":      "http://192.168.1.100:8089",
 *   "apiUsuario":  "admin",
 *   "credenciales": { "password": "secreto" },
 *   "proveedor":   "grandstream",   // opcional, default: grandstream
 *   "authTipo":    "md5_token"      // opcional, default: md5_token
 * }
 */
async function guardarConfig(req, res, next) {
  try {
    const config = await pbxService.guardarConfigPbx(req.empresaId, req.body);

    return res.status(200).json({
      ok:      true,
      mensaje: 'Configuración PBX guardada correctamente',
      data:    config
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/configuracion/pbx/probar-conexion
 * Prueba la conexión con CloudUCM usando las credenciales guardadas.
 * No guarda ningún cambio — es solo una prueba en vivo.
 * Devuelve si la conexión fue exitosa o el mensaje de error.
 */
async function probarConexion(req, res, next) {
  try {
    const resultado = await pbxService.probarConexion(req.empresaId);

    return res.status(200).json({
      ok:      true,
      mensaje: resultado.mensaje,
      data:    resultado
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { obtenerConfig, guardarConfig, probarConexion };