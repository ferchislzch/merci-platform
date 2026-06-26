class ISTTProvider {
    /**
     * Transcribe un buffer de audio a texto
     * @param {Buffer} audioBuffer - Audio en formato compatible con el proveedor
     * @param {Object} options
     * @param {string} options.idioma - Código de idioma ej: 'es', 'en'
     * @param {string} options.formato - Formato del audio: 'wav', 'mp3', 'ogg'
     * @returns {Promise<{
     *   texto: string,
     *   duracionSegundos: number,
     *   idioma: string
     * }>}
     */
    async transcribe(audioBuffer, options = {}) {
        throw new Error(`${this.constructor.name} debe implementar transcribe()`)
    }
}

module.exports = ISTTProvider