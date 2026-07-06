/**
 * workflowTrigger.job.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Job: Evaluar reglas del workflow y ejecutar acciones
 * Ruta oficial: src/jobs/workflowTrigger.job.js
 * Bina #4 — Johann & Kevin
 *
 * PAYLOAD ESPERADO:
 *   { llamadaId: string, textoCliente: string, workflowId: string }
 *
 * FLUJO:
 *   1. Verificar que el workflow pertenece a la empresa (multi-tenant)
 *   2. Llamar a workflowEngine.evaluar() de Bina 2
 *   3. Si ninguna regla aplica → return (sin acción)
 *   4. Si hay acción → switch por tipo:
 *        'crear_ticket'  → encolar job ticket_auto
 *        'transferir'    → TODO (Bina 3 / callOrchestrator pendiente)
 *        default         → error propagado al worker
 *
 * DEPENDENCIAS EXTERNAS:
 *   · Bina 2 (workflowEngine.evaluar)  — ver TODO abajo
 *   · Bina 3 (callOrchestrator)        — bloqueado, ver case 'transferir'
 *
 * POLÍTICA DE ERRORES:
 *   Los errores se propagan sin capturarse. El worker registra el fallo
 *   y reintenta según max_intentos del job.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const prisma = require('../config/database');

// ─── TODO [Bina 2]: Importar el motor de evaluación de workflows ──────────────
//
// Cuando Bina 2 entregue su módulo, reemplazar este stub con el require real.
// Ruta tentativa (confirmar con Bina 2):
//   const workflowEngine = require('../services/workflow/workflowEngine.service');
//
// Contrato de la función esperado (confirmar con Bina 2 antes de integrar):
//   workflowEngine.evaluar(workflowId, textoCliente, empresaId)
//   → Promise<ResultadoEvaluacion>
//
// Donde ResultadoEvaluacion es UNA de estas dos formas:
//   // Ninguna regla aplica:
//   { reglaDisparada: false }
//
//   // Una regla se disparó:
//   {
//     reglaDisparada: true,
//     reglaId:        "uuid-de-la-regla",
//     accion: {
//       tipo:      "crear_ticket" | "transferir",
//       motivo?:   string,         // para 'crear_ticket'
//       prioridad?: string,        // para 'crear_ticket' — valores del catálogo
//       destino?:  string (uuid),  // para 'transferir'
//     }
//   }
//
// STUB temporal — siempre retorna sin acción hasta que Bina 2 entregue:
const workflowEngine = {
  evaluar: async (_workflowId, _textoCliente, _empresaId) => {
    console.warn(
      '[workflowTrigger] workflowEngine.evaluar() es un stub — ' +
      'Bina 2 aún no entregó su implementación. Retornando sin acción.'
    );
    return { reglaDisparada: false };
  }
};

// ─── Handler principal ────────────────────────────────────────────────────────

/**
 * Evalúa las reglas del workflow para el texto transcrito de una llamada
 * y ejecuta la acción correspondiente si alguna regla aplica.
 *
 * @param {{ llamadaId: string, textoCliente: string, workflowId: string }} payload
 * @param {string} empresaId - UUID de la empresa (multi-tenant)
 */
const handle = async (payload, empresaId) => {
  const { llamadaId, textoCliente, workflowId } = payload ?? {};

  // Validar campos obligatorios del payload
  if (!llamadaId || !textoCliente || !workflowId) {
    throw new Error(
      `[workflowTrigger] Payload incompleto. ` +
      `Requeridos: llamadaId, textoCliente, workflowId. ` +
      `Recibido: ${JSON.stringify(payload)}`
    );
  }

  // Verificar que el workflow existe y pertenece a esta empresa (multi-tenant)
  const workflow = await prisma.workflows.findFirst({
    where: {
      id:         workflowId,
      empresa_id: empresaId,   // AISLAMIENTO MULTI-TENANT
      deleted_at: null
    },
    select: { id: true, nombre: true }
  });

  if (!workflow) {
    throw new Error(
      `[workflowTrigger] Workflow ${workflowId} no encontrado ` +
      `para empresa ${empresaId} o ha sido eliminado.`
    );
  }

  // Llamar al motor de evaluación de Bina 2
  // Los errores de workflowEngine se propagan — el worker maneja el reintento
  const resultado = await workflowEngine.evaluar(workflowId, textoCliente, empresaId);

  if (!resultado.reglaDisparada) {
    // Sin acción — la conversación continúa su curso normal
    return;
  }

  const { accion, reglaId } = resultado;

  switch (accion.tipo) {

    case 'crear_ticket':
      // Encolar job de creación de ticket automático.
      // ticket_auto.job.js procesará este job en el siguiente ciclo del worker.
      await prisma.jobs_async.create({
        data: {
          empresa_id:       empresaId,
          tipo:             'ticket_auto',
          payload: {
            llamadaId,
            motivo:    accion.motivo    ?? `Ticket generado por regla ${reglaId}`,
            prioridad: accion.prioridad ?? 'media'  // el job ticketAuto resuelve el UUID del catálogo
          },
          fecha_programada: new Date()
        }
      });
      break;

    case 'transferir':
      // ─── TODO [Bina 3]: Implementar transferencia en vivo ────────────────────
      //
      // Esta acción requiere que callOrchestrator de Bina 3 esté disponible.
      // callOrchestrator necesita el pbx_call_id del canal activo para
      // transferir la llamada en tiempo real al destino indicado.
      //
      // Cuando Bina 3 entregue, reemplazar este bloque con:
      //   const callOrchestrator = require('../services/callOrchestrator.service');
      //   await callOrchestrator.transferirLlamada(llamadaId, accion.destino, empresaId);
      //
      // Por ahora: registrar la intención sin ejecutarla.
      console.warn(
        `[workflowTrigger] Acción 'transferir' pendiente de implementación. ` +
        `callOrchestrator (Bina 3) aún no disponible. ` +
        `llamadaId=${llamadaId} | destino=${accion.destino} | reglaId=${reglaId}`
      );
      break;

    default:
      // Tipo de acción desconocido — se propaga para que el worker lo registre
      throw new Error(
        `[workflowTrigger] Tipo de acción desconocido: '${accion.tipo}'. ` +
        `Regla: ${reglaId}. Verificar con Bina 2 que el tipo es válido.`
      );
  }
};

module.exports = { handle };
