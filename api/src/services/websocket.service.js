const { getIO } = require('../config/socket')

// Eventos disponibles — deben coincidir con catalogo_tipo_evento en bd
const EVENTOS = {
    CALL_STARTED:          'call_started',
    CALL_ENDED:            'call_ended',
    CALL_TRANSFERRED:      'call_transferred',
    TICKET_CREATED:        'ticket_created',
    TICKET_UPDATED:        'ticket_updated',
    AGENT_ONLINE:          'agent_online',
    AGENT_OFFLINE:         'agent_offline',
    PBX_DISCONNECTED:      'pbx_disconnected',
    WORKFLOW_TRIGGERED:    'workflow_triggered',
    STT_COMPLETED:         'stt_completed',
    STT_ERROR:             'stt_error',
    DASHBOARD_UPDATE:      'dashboard_update',
    AGENT_STATUS_CHANGED:  'agent_status_changed',
}

/**
 * Emite un evento a todos los sockets conectados de una empresa
 * Usa rooms de socket.io — cada empresa tiene su room privada
 *
 * @param {string} empresaId - UUID de la empresa destinataria
 * @param {string} evento    - Clave del evento (usar constantes EVENTOS)
 * @param {Object} payload   - Datos del evento
 */
const emit = (empresaId, evento, payload) => {
    try {
        const io = getIO()
        io.to(`empresa:${empresaId}`).emit(evento, {
        evento,
        empresaId,
        payload,
        timestamp: new Date().toISOString(),
        })
    } catch (err) {
        // WebSocket no debe romper el flujo principal
        console.error('[websocket.service] Error al emitir evento:', err.message)
    }
}

/**
 * Emite actualización del dashboard a una empresa
 * Se llama al finalizar cada llamada
 */
const emitDashboardUpdate = (empresaId, metricas) => {
    emit(empresaId, EVENTOS.DASHBOARD_UPDATE, metricas)
}

/**
 * Emite inicio de llamada
 */
const emitCallStarted = (empresaId, { llamadaId, pbxCallId, numeroOrigen }) => {
    emit(empresaId, EVENTOS.CALL_STARTED, { llamadaId, pbxCallId, numeroOrigen })
}

/**
 * Emite fin de llamada
 */
const emitCallEnded = (empresaId, { llamadaId, duracionSeg, resultado }) => {
    emit(empresaId, EVENTOS.CALL_ENDED, { llamadaId, duracionSeg, resultado })
}

/**
 * Emite creación de ticket
 */
const emitTicketCreated = (empresaId, { ticketId, titulo, prioridad }) => {
    emit(empresaId, EVENTOS.TICKET_CREATED, { ticketId, titulo, prioridad })
}

/**
 * Emite cambio de estado de agente virtual
 */
const emitAgentStatusChanged = (empresaId, { agenteId, estadoAnterior, estadoNuevo }) => {
    emit(empresaId, EVENTOS.AGENT_STATUS_CHANGED, { agenteId, estadoAnterior, estadoNuevo })
}

module.exports = {
    emit,
    emitDashboardUpdate,
    emitCallStarted,
    emitCallEnded,
    emitTicketCreated,
    emitAgentStatusChanged,
    EVENTOS,
}