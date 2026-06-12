const OpenAI = require('openai')
const { toFile } = require('openai')
const ISTTProvider = require('./ISTTProvider')
const env = require('../../config/env')

class WhisperSTTProvider extends ISTTProvider {
    constructor() {
        super()
        this.client = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        organization: env.OPENAI_ORG_ID || undefined,
        })
    }

    async transcribe(audioBuffer, options = {}) {
        const idioma = options.idioma || 'es'
        const formato = options.formato || 'wav'

        // Whisper recibe el audio como un File object
        const audioFile = await toFile(audioBuffer, `audio.${formato}`, {
        type: `audio/${formato}`,
        })

        const response = await this.client.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: idioma,
        response_format: 'verbose_json', // duración
        })

        return {
        texto: response.text,
        duracionSegundos: response.duration || 0,
        idioma: response.language || idioma,
        }
    }
}

module.exports = WhisperSTTProvider