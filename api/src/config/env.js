require('dotenv').config()
const { z } = require('zod')

const envSchema = z.object({
  // Servidor
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3000'),

  // Base de datos
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),

  // JWT
    JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
    JWT_EXPIRES_IN: z.string().default('8h'),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // OpenAI (LLM + Whisper STT + TTS)
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_ORG_ID: z.string().optional(),

  // Google Gemini (LLM)
    GOOGLE_GEMINI_API_KEY: z.string().min(1),

  // Google Cloud STT
    GOOGLE_CLOUD_PROJECT_ID: z.string().min(1),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1),

  // ElevenLabs (TTS)
    ELEVENLABS_API_KEY: z.string().min(1),

  // WebSocket
    WS_CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Rate limiting
    RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
    RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),

  // Worker
    WORKER_POLL_INTERVAL_MS: z.string().default('5000'),
    WORKER_BATCH_SIZE: z.string().default('5'),

  // Precios proveedores IA (USD)
    PRICE_OPENAI_LLM_INPUT_PER_1M: z.string().default('2.50'),
    PRICE_OPENAI_LLM_OUTPUT_PER_1M: z.string().default('10.00'),
    PRICE_OPENAI_STT_PER_MINUTE: z.string().default('0.006'),
    PRICE_OPENAI_TTS_PER_1M_CHARS: z.string().default('15.00'),
    PRICE_GOOGLE_LLM_INPUT_PER_1M: z.string().default('0.075'),
    PRICE_GOOGLE_LLM_OUTPUT_PER_1M: z.string().default('0.30'),
    PRICE_GOOGLE_STT_PER_MINUTE: z.string().default('0.016'),
    PRICE_ELEVENLABS_TTS_PER_1M_CHARS: z.string().default('180.00'),

  // Margen MERCI sobre costo del proveedor (%)
    MERCI_MARGIN_PERCENTAGE: z.string().default('30'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error('ERROR: Variables de entorno inválidas o faltantes:')
    console.error(parsed.error.flatten().fieldErrors)
  process.exit(1) // El servidor NO arranca si faltan variables críticas
}

module.exports = parsed.data