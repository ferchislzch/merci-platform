// RESPONSABLE: Bina 4 (coordinado con Bina 1 para permisos)

// Propósito: Crear ticket automáticamente cuando la IA
// no resolvió la llamada o se detectó escalada_humano = true.}

// Flujo esperado:
//   1. Recibir payload con { llamadaId, empresaId, motivo }
//   2. Obtener datos de la llamada (cliente, transcripcion, sentimiento)
//   3. Crear ticket en BD con prioridad según sentimiento
//   4. Emitir WebSocket ticket_created
//   5. Registrar en auditoria_logs

const handle = async (payload, empresaId) => {
  // Bina 4
  // payload: { llamadaId, motivo, prioridadSugerida }
    throw new Error('ticketAuto.job no implementado aún')
}

module.exports = { handle }