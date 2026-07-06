// src/modules/llamadas/llamadas.controller.js
// Bina 3 — CloudUCM, Llamadas y PBX
// Capa HTTP del módulo de llamadas. Sin lógica de negocio.

'use strict';

const llamadasService = require('./llamadas.service');

/**
 * GET /api/llamadas
 * Lista el historial de llamadas de la empresa con paginación.
 * Permiso requerido: llamadas.ver
 *
 * Query params opcionales:
 *   pagina  - número de página (default: 1)
 *   limite  - registros por página (default: 20, max recomendado: 100)
 *   desde   - fecha ISO de inicio del rango
 *   hasta   - fecha ISO de fin del rango
 *   estado  - nombre del estado de llamada (ej: 'Finalizada')
 */
async function listar(req, res, next) {
  try {
    const resultado = await llamadasService.listarLlamadas(
      req.empresaId,
      req.query
    );

    return res.status(200).json({
      ok:      true,
      mensaje: 'Llamadas obtenidas correctamente',
      data:    resultado
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/llamadas/:id
 * Devuelve el detalle completo de una llamada específica.
 * Permiso requerido: llamadas.detalle
 */
async function obtenerDetalle(req, res, next) {
  try {
    const llamada = await llamadasService.obtenerDetalleLlamada(
      req.empresaId,
      req.params.id
    );

    return res.status(200).json({
      ok:      true,
      mensaje: 'Detalle de llamada obtenido correctamente',
      data:    llamada
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/llamadas/sync-cdr
 * Sincroniza manualmente el CDR desde CloudUCM hacia MERCI.
 * Permiso requerido: llamadas.ver (o definir uno específico: llamadas.sync)
 *
 * Body opcional:
 *   { desde: "2024-01-01", hasta: "2024-12-31" }
 */
async function sincronizarCDR(req, res, next) {
  try {
    const resultado = await llamadasService.sincronizarCDR(
      req.empresaId,
      req.body || {}
    );

    return res.status(200).json({
      ok:      true,
      mensaje: `Sincronización ${resultado.status}: ${resultado.registrosSincronizados} registros procesados`,
      data:    resultado
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listar, obtenerDetalle, sincronizarCDR };