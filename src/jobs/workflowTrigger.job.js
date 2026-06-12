// RESPONSABLE: Bina 4 (coordinado con Bina 2)

// Propósito: Evaluar reglas de workflow SI → ENTONCES
// cuando se detecta una condición durante una llamada.
//
// Flujo esperado:
//   1. Recibir payload con { llamadaId, empresaId, textoCliente }
//   2. Cargar reglas activas de la empresa desde reglas_workflow
//   3. Evaluar cada condición JSONB contra el textoCliente
//   4. Si hay match: ejecutar acción (transferir / crear ticket / escalar)
//   5. Registrar en eventos_tiempo_real

const handle = async (payload, empresaId) => {
  // Bina 4 + Bina 2
  // payload: { llamadaId, textoCliente, workflowId }
    throw new Error('workflowTrigger.job no implementado aún')
}

module.exports = { handle }