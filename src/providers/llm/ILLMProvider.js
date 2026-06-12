// Interface (contrato) que todos los providers LLM deben cumplir
// En JS no hay interfaces nativas, usamos una clase base que lanza
// error si el método no está implementado en la subclase

class ILLMProvider {
    /**
     * Genera una respuesta de texto dado un historial de mensajes
     * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
     * @param {Object} options
     * @param {number} options.temperature - Entre 0 y 1
     * @param {string} options.model - Modelo específico a usar
     * @returns {Promise<{
     *   text: string,
     *   tokensEntrada: number,
     *   tokensSalida: number,
     *   modelo: string
     * }>}
     */
    async chat(messages, options = {}) {
        throw new Error(`${this.constructor.name} debe implementar chat()`)
    }
}

module.exports = ILLMProvider