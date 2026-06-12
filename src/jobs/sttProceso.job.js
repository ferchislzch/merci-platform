// RESPONSABLE: Bina 4

// Propósito: Transcribir audio de una llamada usando el provider STT
// configurado para la empresa.

// Flujo esperado:
//   1. Recibir payload con { llamadaId, empresaId, audioUrl, formato, idioma }
//   2. Obtener provider STT con AIProviderFactory.getProvider(empresaId, 'stt')
//   3. Descargar o cargar el audioBuffer
//   4. Llamar provider.transcribe(audioBuffer, { idioma, formato })
//   5. Actualizar llamadas.transcripcion y llamadas.stt_estado en BD
//   6. Registrar consumo con AIProviderFactory.registrarConsumo()
//   7. Emitir WebSocket stt_completed

const handle = async (payload, empresaId) => {
  // Bina 4
  // payload: { llamadaId, audioUrl, formato, idioma }
    throw new Error('sttProceso.job no implementado aún')
}

module.exports = { handle }