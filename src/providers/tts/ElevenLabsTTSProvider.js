const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js')
const ITTSProvider = require('./ITTSProvider')
const env = require('../../config/env')

class ElevenLabsTTSProvider extends ITTSProvider {
    constructor() {
        super()
        this.client = new ElevenLabsClient({
        apiKey: env.ELEVENLABS_API_KEY,
        })
    }

    async synthesize(texto, options = {}) {
        // voice puede ser un voice_id de ElevenLabs
        // Por defecto se usa "Rachel" (voz en español disponible)
        const voiceId = options.voz || 'EXAVITQu4vr4xnSDxMaL'

        const audioStream = await this.client.textToSpeech.convert(voiceId, {
        text: texto,
        model_id: 'eleven_multilingual_v2',
        output_format: 'mp3_44100_128',
        })

        // Convertir stream a Buffer
        const chunks = []
        for await (const chunk of audioStream) {
        chunks.push(chunk)
        }
        const audioBuffer = Buffer.concat(chunks)

        return {
        audioBuffer,
        formato: 'mp3',
        caracteresUsados: texto.length,
        }
    }
}

module.exports = ElevenLabsTTSProvider