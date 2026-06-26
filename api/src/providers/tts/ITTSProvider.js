class ITTSProvider {
    /**
     * Convierte texto a audio
     * @param {string} texto - Texto a sintetizar
     * @param {Object} options
     * @param {string} options.voz - ID o nombre de la voz a usar
     * @param {string} options.idioma - Código de idioma ej: 'es', 'en'
     * @returns {Promise<{
     *   audioBuffer: Buffer,
     *   formato: string,
     *   caracteresUsados: number
     * }>}
     */
    async synthesize(texto, options = {}) {
        throw new Error(`${this.constructor.name} debe implementar synthesize()`)
    }
}

module.exports = ITTSProvider