// src/modules/extensiones/extensiones.controller.js
// Bina 3 — CloudUCM, Llamadas y PBX
// Capa HTTP del módulo de extensiones. Sin lógica de negocio.

'use strict';

const extensionesService = require('./extensiones.service');

/**
 * GET /api/extensiones
 * Lista las extensiones de la empresa almacenadas en BD.
 * Permiso requerido: extensiones.ver
 */
async function listar(req, res, next) {
  try {
    const resultado = await extensionesService.listarExtensiones(req.empresaId);

    return res.status(200).json({
      ok:      true,
      mensaje: 'Extensiones obtenidas correctamente',
      data:    resultado
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/extensiones/sync
 * Sincroniza las extensiones del PBX de CloudUCM hacia la BD de MERCI.
 * Permiso requerido: extensiones.sync
 *
 * No requiere body — usa las credenciales guardadas en configuraciones_pbx.
 * Si no hay configuración PBX activa, devuelve 404.
 * Si CloudUCM no responde, devuelve 502 controlado.
 */
async function sincronizar(req, res, next) {
  try {
    const resultado = await extensionesService.sincronizarExtensiones(req.empresaId);

    return res.status(200).json({
      ok:      true,
      mensaje: `Sincronización ${resultado.status}: ${resultado.sincronizadas} extensiones procesadas`,
      data:    resultado
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listar, sincronizar };