const OpenAI = require('openai')
const ITTSProvider = require('./ITTSProvider')
const env = require('../../config/env')

class OpenAITTSProvider extends ITTSProvider {
    constructor() {
        super()
        this.client = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        organization: env.OPENAI_ORG_ID || undefined,
        })
    }

    async synthesize(texto, options = {}) {
        // Voces disponibles en OpenAI TTS:
        // alloy, echo, fable, onyx, nova, shimmer
        const voz = options.voz || 'nova'

        const response = await this.client.audio.speech.create({
        model: 'tts-1',
        voice: voz,
        input: texto,
        response_format: 'mp3',
        })

        // Convertir la respuesta a Buffer
        const arrayBuffer = await response.arrayBuffer()
        const audioBuffer = Buffer.from(arrayBuffer)

        return {
        audioBuffer,
        formato: 'mp3',
        caracteresUsados: texto.length,
        }
    }
}

module.exports = OpenAITTSProvi