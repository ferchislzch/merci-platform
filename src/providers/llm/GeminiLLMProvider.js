const { GoogleGenerativeAI } = require('@google/generative-ai')
const ILLMProvider = require('./ILLMProvider')
const env = require('../../config/env')

class GeminiLLMProvider extends ILLMProvider {
    constructor() {
        super()
        this.client = new GoogleGenerativeAI(env.GOOGLE_GEMINI_API_KEY)
    }

    async chat(messages, options = {}) {
        const modelo = options.model || 'gemini-1.5-flash'
        const temperatura = options.temperature ?? 0.7

        const geminiModel = this.client.getGenerativeModel({
        model: modelo,
        generationConfig: { temperature: temperatura },
        })

        // Gemini maneja el system prompt por separado
        // Extraemos el primer mensaje 'system' si existe
        const systemMsg = messages.find((m) => m.role === 'system')
        const historial = messages.filter((m) => m.role !== 'system')

        // Convertir formato OpenAI → formato Gemini
        // OpenAI usa 'assistant', Gemini usa 'model'
        const geminiHistory = historial.slice(0, -1).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
        }))

        const ultimoMensaje = historial[historial.length - 1]

        const chat = geminiModel.startChat({
        history: geminiHistory,
        systemInstruction: systemMsg ? systemMsg.content : undefined,
        })

        const result = await chat.sendMessage(ultimoMensaje.content)
        const response = await result.response

        return {
        text: response.text(),
        tokensEntrada: response.usageMetadata?.promptTokenCount || 0,
        tokensSalida: response.usageMetadata?.candidatesTokenCount || 0,
        modelo,
        }
    }
}

module.exports = GeminiLLMProvider