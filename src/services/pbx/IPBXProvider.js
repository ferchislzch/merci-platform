// Interface base para cualquier proveedor PBX
// Por ahora solo se implementa CloudUCM, pero la arquitectura
// permite agregar Cisco, Asterisk, FreePBX sin tocar el resto del sistema

class IPBXProvider {

    /**
     * Autentica contra el PBX y obtiene sesión
     * @param {Object} credenciales - Datos de conexión de configuraciones_pbx
     * @returns {Promise}
     */
    async connect(credenciales) {
        throw new Error(`${this.constructor.name} debe implementar connect()`)
    }

    /**
     * Transfiere una llamada activa a una extensión o grupo
     * @param {string} callId - ID de la llamada en el PBX
     * @param {string} destino - Extensión o número destino
     * @returns {Promise}
     */
    async transferCall(callId, destino) {
        throw new Error(`${this.constructor.name} debe implementar transferCall()`)
    }

    /**
     * Obtiene el CDR (registro de llamadas) de un período
     * @param {Object} filtros - { fechaInicio, fechaFin, extension }
     * @returns {Promise}
     */
    async getCDR(filtros) {
        throw new Error(`${this.constructor.name} debe implementar getCDR()`)
    }

    /**
     * Obtiene grabación de una llamada bajo demanda
     * @param {string} callId - ID de la llamada en el PBX
     * @returns {Promise} - Audio en buffer
     */
    async getRecording(callId) {
        throw new Error(`${this.constructor.name} debe implementar getRecording()`)
    }

    /**
     * Obtiene lista de extensiones registradas en el PBX
     * @returns {Promise}
     */
    async getExtensions() {
        throw new Error(`${this.constructor.name} debe implementar getExtensions()`)
    }

    /**
     * Verifica que la conexión con el PBX sigue activa
     * @returns {Promise}
     */
    async ping() {
        throw new Error(`${this.constructor.name} debe implementar ping()`)
    }
}

module.exports = IPBXProvider