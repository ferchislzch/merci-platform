const speech = require('@google-cloud/speech')
const ISTTProvider = require('./ISTTProvider')

// Google Cloud usa GOOGLE_APPLICATION_CREDENTIALS del entorno
// automáticamente — no se necesita pasar explícitamente
class GoogleSTTProvider extends ISTTProvider {
    constructor() {
        super()
        this.client = new speech.SpeechClient()
    }

    async transcribe(audioBuffer, options = {}) {
        const idioma = options.idioma || 'es-MX'
        const formato = options.formato || 'wav'

        // Mapeo de formato a encoding de Google
        const encodingMap = {
        wav: 'LINEAR16',
        mp3: 'MP3',
        ogg: 'OGG_OPUS',
        flac: 'FLAC',
        }

        const request = {
        audio: {
            content: audioBuffer.toString('base64'),
        },
        config: {
            encoding: encodingMap[formato] || 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: idioma,
            enableAutomaticPunctuation: true,
        },
        }

        const [response] = await this.client.recognize(request)
        const transcripcion = response.results
        .map((r) => r.alternatives[0].transcript)
        .join(' ')

        // Google no devuelve duración directamente en recognize()
        // Se estima desde el tamaño del buffer (aproximado)
        const duracionEstimada = audioBuffer.length / (16000 * 2)

        return {
        texto: transcripcion,
        duracionSegundos: Math.round(duracionEstimada),
        idioma,
        }
    }
}

module.exports = GoogleSTTProvider