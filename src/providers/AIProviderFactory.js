const prisma = require('../config/database')
const env = require('../config/env')

// Providers LLM
const OpenAILLMProvider = require('./llm/OpenAILLMProvider')
const GeminiLLMProvider = require('./llm/GeminiLLMProvider')

// Providers STT
const WhisperSTTProvider = require('./stt/WhisperSTTProvider')
const GoogleSTTProvider  = require('./stt/GoogleSTTProvider')

// Providers TTS
const OpenAITTSProvider     = require('./tts/OpenAITTSProvider')
const ElevenLabsTTSProvider = require('./tts/ElevenLabsTTSProvider')

// Cache en memoria para no hacer query a BD en cada llamada
// Se invalida cuando la empresa actualiza su configuración
const cache = new Map()

// Mapa de nombre de proveedor → clase instanciable
const LLM_PROVIDERS = {
    'OpenAI GPT-4o': OpenAILLMProvider,
    'Google Gemini': GeminiLLMProvider,
}
const STT_PROVIDERS = {
    'OpenAI Whisper':          WhisperSTTProvider,
    'Google Speech-to-Text':   GoogleSTTProvider,
}
const TTS_PROVIDERS = {
    'OpenAI TTS':  OpenAITTSProvider,
    'ElevenLabs':  ElevenLabsTTSProvider,
}

/**
 * Devuelve la instancia del provider configurado para una empresa
 * @param {string} empresaId - UUID de la empresa
 * @param {'llm'|'stt'|'tts'} tipo - Tipo de provider requerido
 * @returns {Promise}
 */
const getProvider = async (empresaId, tipo) => {
    const cacheKey = `${empresaId}:${tipo}`

    // Devolver instancia cacheada si existe
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey)
    }

    // Leer configuración de la empresa desde BD
    const config = await prisma.configuraciones_empresa.findUnique({
        where: { empresa_id: empresaId },
        include: {
        catalogo_proveedores_ia_configuraciones_empresa_proveedor_llm_idTocatalogo_proveedores_ia: true,
        catalogo_proveedores_ia_configuraciones_empresa_proveedor_stt_idTocatalogo_proveedores_ia: true,
        catalogo_proveedores_ia_configuraciones_empresa_proveedor_tts_idTocatalogo_proveedores_ia: true,
        },
    })

    if (!config) {
        throw new Error(`No existe configuración de IA para la empresa ${empresaId}`)
    }

    let proveedorNombre
    let proveedorMapa

    // Seleccionar el proveedor según el tipo solicitado
    if (tipo === 'llm') {
        proveedorNombre = config
        .catalogo_proveedores_ia_configuraciones_empresa_proveedor_llm_idTocatalogo_proveedores_ia
        ?.nombre
        proveedorMapa = LLM_PROVIDERS
    } else if (tipo === 'stt') {
        proveedorNombre = config
        .catalogo_proveedores_ia_configuraciones_empresa_proveedor_stt_idTocatalogo_proveedores_ia
        ?.nombre
        proveedorMapa = STT_PROVIDERS
    } else if (tipo === 'tts') {
        proveedorNombre = config
        .catalogo_proveedores_ia_configuraciones_empresa_proveedor_tts_idTocatalogo_proveedores_ia
        ?.nombre
        proveedorMapa = TTS_PROVIDERS
    } else {
        throw new Error(`Tipo de provider inválido: ${tipo}`)
    }

    if (!proveedorNombre) {
        throw new Error(`La empresa ${empresaId} no tiene configurado un provider de tipo ${tipo}`)
    }

    const ProviderClass = proveedorMapa[proveedorNombre]

    if (!ProviderClass) {
        throw new Error(`Provider no soportado: ${proveedorNombre}`)
    }

    // Instanciar con keys de MERCI desde process.env (Modelo B)
    // El cliente elige el proveedor, MERCI pone las keys
    const instance = new ProviderClass()

    // Guardar en cache con TTL de 5 minutos
    cache.set(cacheKey, instance)
    setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000)

    return instance
}

/**
 * Invalida el cache de una empresa específica
 * Llamar cuando el admin cambia la configuración de providers
 * @param {string} empresaId
 */
const invalidateCache = (empresaId) => {
    cache.delete(`${empresaId}:llm`)
    cache.delete(`${empresaId}:stt`)
    cache.delete(`${empresaId}:tts`)
}

/**
 * Calcula el costo estimado de una operación IA
 * y registra el consumo en la tabla consumo_ia
 * @param {Object} params
 */
const registrarConsumo = async ({
    empresaId,
    llamadaId,
    proveedorId,
    tipo, // 'llm' | 'stt' | 'tts'
    tokensEntrada,
    tokensSalida,
    duracionSeg,
    caracteres,
    }) => {
    // Calcular costo según tipo y proveedor
    const margen = 1 + (parseFloat(env.MERCI_MARGIN_PERCENTAGE) / 100)
    let costoBase = 0

    if (tipo === 'llm') {
        const precioEntrada = parseFloat(env.PRICE_OPENAI_LLM_INPUT_PER_1M)
        const precioSalida  = parseFloat(env.PRICE_OPENAI_LLM_OUTPUT_PER_1M)
        costoBase = ((tokensEntrada || 0) * precioEntrada / 1_000_000)
                + ((tokensSalida  || 0) * precioSalida  / 1_000_000)
    } else if (tipo === 'stt') {
        const precioPorMin = parseFloat(env.PRICE_OPENAI_STT_PER_MINUTE)
        costoBase = ((duracionSeg || 0) / 60) * precioPorMin
    } else if (tipo === 'tts') {
        const precioPor1M = parseFloat(env.PRICE_OPENAI_TTS_PER_1M_CHARS)
        costoBase = ((caracteres || 0) * precioPor1M / 1_000_000)
    }

    const costoConMargen = costoBase * margen

    await prisma.consumo_ia.create({
        data: {
        empresa_id:      empresaId,
        llamada_id:      llamadaId || null,
        proveedor_id:    proveedorId || null,
        tokens_entrada:  tokensEntrada || 0,
        tokens_salida:   tokensSalida  || 0,
        costo_estimado:  costoConMargen,
        },
    })

    return costoConMargen
}

module.exports = { getProvider, invalidateCache, registrarConsumo }