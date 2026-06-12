// DESCARTADO TEMPORALMENTE
// recordfiles viene vacío en el CDR del cliente (PRUEBAS REALIZADAS). 
// Requiere habilitar grabaciones en la configuración del UCM.
// Implementar SI el cliente active la funcionalidad.

const handle = async (payload, empresaId) => {
    console.warn('[grabacionFetch] Grabaciones no disponibles en este UCM')
}

module.exports = { handle }