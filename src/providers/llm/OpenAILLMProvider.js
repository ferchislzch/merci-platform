const OpenAI = require('openai')
const ILLMProvider = require('./ILLMProvider')
const env = require('../../config/env')

class OpenAILLMProvider extends ILLMProvider {
    constructor() {
        super()
        this.client = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        organization: env.OPENAI_ORG_ID || undefined,
        })
    }

    async chat(messages, options = {}) {
        const modelo = options.model || 'gpt-4o'
        const temperatura = options.temperature ?? 0.7

        const response = await this.client.chat.completions.create({
        model: modelo,
        messages,
        temperature: temperatura,
        })

        const choice = response.choices[0]

        return {
        text: choice.message.content,
        tokensEntrada: response.usage.prompt_tokens,
        tokensSalida: response.usage.completion_tokens,
        modelo,
        }
    }
}

module.exports = OpenAILLMProvider