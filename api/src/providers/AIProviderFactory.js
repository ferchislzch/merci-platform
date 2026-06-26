/**
 * AIProviderFactory.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fábrica Central de Proveedores de Inteligencia Artificial
 * Ruta oficial: src/providers/AIProviderFactory.js
 * Bina #4 — Johann & Kevin
 *
 * PATRÓN: Singleton + Factory Method
 *
 * RESPONSABILIDADES:
 *   1. getProvider()       → Instanciar y cachear providers de IA por empresa/tipo
 *   2. registrarConsumo()  → Calcular costo con margen MERCI y persistir en consumo_ia
 *
 * CACHÉ EN MEMORIA:
 *   Clave compuesta `${empresaId}:${tipoProvider}` evita:
 *   · Colisiones STT/LLM/TTS de la misma empresa con la misma apiKey
 *   · Consultas repetidas a Prisma en 100 llamadas simultáneas de la misma empresa
 *   · Re-creación del cliente OpenAI en cada petición
 *
 * POLIMORFISMO REAL (Opción B):
 *   Consulta catalogo_proveedores_ia para determinar la clase a instanciar.
 *   Implementados:  OpenAI Whisper · OpenAI GPT-4o · OpenAI TTS
 *   No implementados: Google STT · Google Gemini · ElevenLabs → NotImplementedError
 *
 * CÁLCULO DE COSTOS (registrarConsumo):
 *   Los precios base se leen de process.env para permitir actualización sin redeploy.
 *   El margen de MERCI (MERCI_MARGIN_PERCENTAGE) se aplica encima del costo base.
 *   Variables de entorno requeridas en .env:
 *
 *     MERCI_MARGIN_PERCENTAGE=10            # % de margen sobre el costo base
 *     PRICE_OPENAI_STT_PER_MIN=0.006        # Whisper: USD por minuto de audio
 *     PRICE_OPENAI_LLM_INPUT_PER_1M=2.50    # GPT-4o: USD por 1M tokens de entrada
 *     PRICE_OPENAI_LLM_OUTPUT_PER_1M=10.00  # GPT-4o: USD por 1M tokens de salida
 *     PRICE_OPENAI_TTS_PER_1M_CHARS=15.00   # TTS-1:  USD por 1M caracteres
 *
 * MULTI-TENANT:
 *   Cada empresa tiene su propia configuración en configuraciones_empresa.
 *   La fábrica NUNCA mezcla credenciales entre empresas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const prisma = require('../config/database');

// ─── Imports de Providers Implementados ──────────────────────────────────────

const WhisperSTTProvider = require('./stt/WhisperSTTProvider');
const OpenAILLMProvider  = require('./llm/OpenAILLMProvider');
const OpenAITTSProvider  = require('./tts/OpenAITTSProvider');

// ─── Error Personalizado ──────────────────────────────────────────────────────

/**
 * Lanzado cuando se solicita un proveedor cuya clase aún no ha sido
 * programada en MERCI. Distingue "proveedor desconocido" de "no programado".
 */
class NotImplementedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Tipos de provider válidos — corresponden a catalogo_proveedores_ia.tipo */
const TIPOS_VALIDOS = new Set(['stt', 'llm', 'tts']);

/**
 * MAPA DE FÁBRICAS
 * nombre_en_catálogo → función que instancia la clase del provider
 *
 * Para agregar un nuevo provider (ej: Google Gemini):
 *   1. Crear src/providers/llm/GoogleGeminiProvider.js (extends ILLMProvider)
 *   2. Importarlo arriba
 *   3. Cambiar su entrada de `null` a `(apiKey) => new GoogleGeminiProvider(apiKey)`
 * Sin tocar ningún Worker ni Job.
 *
 * IMPORTANTE: los nombres deben coincidir EXACTAMENTE con el campo
 * `nombre` en catalogo_proveedores_ia (case-sensitive).
 */
const FABRICAS_PROVIDER = {
  // STT ───────────────────────────────────────────────────────────────────────
  'OpenAI Whisper':        (apiKey) => new WhisperSTTProvider(apiKey),
  'Google Speech-to-Text': null,   // TODO: implementar GoogleSTTProvider

  // LLM ───────────────────────────────────────────────────────────────────────
  'OpenAI GPT-4o':         (apiKey) => new OpenAILLMProvider(apiKey),
  'Google Gemini':         null,   // TODO: implementar GoogleGeminiProvider

  // TTS ───────────────────────────────────────────────────────────────────────
  'OpenAI TTS':            (apiKey) => new OpenAITTSProvider(apiKey),
  'ElevenLabs':            null,   // TODO: implementar ElevenLabsTTSProvider
};

/**
 * Provider por defecto para cada tipo cuando la empresa no tiene
 * proveedor configurado en configuraciones_empresa.proveedor_{tipo}_id.
 */
const DEFAULTS_POR_TIPO = {
  stt: 'OpenAI Whisper',
  llm: 'OpenAI GPT-4o',
  tts: 'OpenAI TTS',
};

// ─── Helpers Financieros ─────────────────────────────────────────────────────

/**
 * Lee un valor numérico de process.env con un fallback seguro.
 * Evita NaN silencioso cuando la variable no está definida en .env.
 *
 * @param {string} varName  - Nombre de la variable de entorno
 * @param {number} fallback - Valor por defecto si la variable no está definida
 * @returns {number}
 */
function _envNum(varName, fallback) {
  const val = parseFloat(process.env[varName]);
  return isNaN(val) ? fallback : val;
}

/**
 * Calcula el costo base en USD para una operación IA según su tipo.
 * Los precios unitarios se leen de process.env en cada llamada,
 * por lo que pueden actualizarse sin reiniciar el servidor en la mayoría
 * de entornos (dependiendo del gestor de procesos).
 *
 * CONVENCIÓN STT (Bina #4):
 *   tokensEntrada = duración del audio en SEGUNDOS (desde verbose_json de Whisper)
 *   → El costo se calcula como (segundos / 60) × tarifa_por_minuto
 *
 * CONVENCIÓN TTS (Bina #4):
 *   caracteres    = longitud del texto sintetizado
 *   → El costo se calcula como (caracteres / 1_000_000) × tarifa_por_millón_chars
 *
 * @param {'stt'|'llm'|'tts'} tipo
 * @param {Object} params
 * @param {number} params.tokensEntrada - Para LLM: prompt_tokens; para STT: segundos
 * @param {number} params.tokensSalida  - Para LLM: completion_tokens; para otros: 0
 * @param {number} params.duracionSeg   - Segundos de audio (STT). Puede ser float.
 * @param {number} params.caracteres    - Caracteres de texto (TTS)
 * @returns {number} Costo base en USD (sin margen MERCI)
 */
function _calcularCostoBase(tipo, { tokensEntrada, tokensSalida, duracionSeg, caracteres }) {
  switch (tipo) {

    case 'stt': {
      // Whisper: $X.XXX por minuto de audio
      // Usamos duracionSeg directamente (más preciso que tokensEntrada en este contexto)
      const precioPorMinuto = _envNum('PRICE_OPENAI_STT_PER_MIN', 0.006);
      const segundos        = Math.max(0, duracionSeg ?? tokensEntrada ?? 0);
      return (segundos / 60) * precioPorMinuto;
    }

    case 'llm': {
      // GPT-4o: precio diferencial entrada vs salida por 1M tokens
      const precioEntrada = _envNum('PRICE_OPENAI_LLM_INPUT_PER_1M',  2.50);
      const precioSalida  = _envNum('PRICE_OPENAI_LLM_OUTPUT_PER_1M', 10.00);
      return (
        ((tokensEntrada ?? 0) / 1_000_000) * precioEntrada +
        ((tokensSalida  ?? 0) / 1_000_000) * precioSalida
      );
    }

    case 'tts': {
      // OpenAI TTS: $X por 1M caracteres de texto sintetizado
      const precioPorMillon = _envNum('PRICE_OPENAI_TTS_PER_1M_CHARS', 15.00);
      return ((caracteres ?? 0) / 1_000_000) * precioPorMillon;
    }

    default:
      return 0;
  }
}

// ─── Clase Principal ──────────────────────────────────────────────────────────

class AIProviderFactory {

  constructor() {
    /**
     * Caché en memoria de providers ya instanciados.
     * Clave compuesta: `${empresaId}:${tipoProvider}`
     *
     * La clave COMPUESTA es obligatoria: una empresa con una sola apiKey
     * necesita 3 instancias distintas (WhisperSTTProvider, OpenAILLMProvider,
     * OpenAITTSProvider). Una clave simple por apiKey causaría colisión y
     * devolvería la clase incorrecta en la segunda petición.
     *
     * @type {Map<string, {provider, idioma, modelo, temperatura, voz}>}
     */
    this._cache = new Map();
  }

  // ─── getProvider ───────────────────────────────────────────────────────────

  /**
   * Obtiene (o crea y cachea) el provider de IA para una empresa y tipo dados.
   *
   * Flujo:
   *   1. Validar inputs
   *   2. Cache HIT → retornar inmediatamente sin tocar la BD
   *   3. Cache MISS → consultar configuraciones_empresa + catalogo_proveedores_ia
   *   4. Instanciar la clase correcta según el nombre del catálogo
   *   5. Guardar en caché y retornar objeto unificado
   *
   * @param {string} empresaId    - UUID de la empresa (multi-tenant)
   * @param {string} tipoProvider - 'stt' | 'llm' | 'tts'
   *
   * @returns {Promise<{
   *   provider:    WhisperSTTProvider|OpenAILLMProvider|OpenAITTSProvider,
   *   idioma:      string,   // Código ISO 639-1 (ej: 'es'). Para STT y LLM.
   *   modelo:      string,   // Modelo de IA (ej: 'gpt-4o', 'tts-1'). Para LLM y TTS.
   *   temperatura: number,   // Float 0–1. Para LLM. (Decimal Prisma → Number nativo JS)
   *   voz:         string    // Voz TTS (ej: 'alloy'). Para TTS.
   * }>}
   *
   * @throws {Error}               Si la empresa no tiene configuración IA
   * @throws {Error}               Si credenciales_ia.openai_api_key no está configurada
   * @throws {NotImplementedError} Si el proveedor configurado no tiene clase implementada
   */
  async getProvider(empresaId, tipoProvider) {

    // — Validaciones de entrada —
    if (!empresaId || typeof empresaId !== 'string' || !empresaId.trim()) {
      throw new Error('[AIProviderFactory] empresaId debe ser un UUID string válido y no vacío.');
    }
    if (!TIPOS_VALIDOS.has(tipoProvider)) {
      throw new Error(
        `[AIProviderFactory] tipoProvider inválido: "${tipoProvider}". ` +
        `Valores permitidos: ${[...TIPOS_VALIDOS].join(', ')}`
      );
    }

    // — Cache HIT —
    const cacheKey = `${empresaId}:${tipoProvider}`;
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    // — Cache MISS: consulta 1 — configuraciones_empresa —
    // Consultas separadas (no joins via relaciones Prisma auto-generadas)
    // para evitar dependencia de los strings de relación que Prisma genera
    // automáticamente y que son frágiles ante cambios de nombres de FK.
    const config = await prisma.configuraciones_empresa.findUnique({
      where:  { empresa_id: empresaId },
      select: {
        credenciales_ia:    true,  // JSONB: { openai_api_key: 'sk-...' }
        idioma:             true,  // VARCHAR(10): 'es', 'en', etc.
        voz_ia:             true,  // VARCHAR(50): 'alloy', 'nova', etc.
        modelo_ia:          true,  // VARCHAR(50): 'gpt-4o', 'tts-1', etc.
        temperatura_modelo: true,  // DECIMAL(3,2): 0.0 – 1.0
        proveedor_stt_id:   true,  // UUID | null → FK a catalogo_proveedores_ia
        proveedor_llm_id:   true,  // UUID | null → FK a catalogo_proveedores_ia
        proveedor_tts_id:   true,  // UUID | null → FK a catalogo_proveedores_ia
      }
    });

    if (!config) {
      throw new Error(
        `[AIProviderFactory] No existe configuración IA para empresa ${empresaId}. ` +
        `Verifica que la empresa tenga un registro en configuraciones_empresa.`
      );
    }

    // — Extraer API key de credenciales_ia —
    const apiKey = config.credenciales_ia?.openai_api_key;
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new Error(
        `[AIProviderFactory] Empresa ${empresaId} no tiene 'openai_api_key' ` +
        `en configuraciones_empresa.credenciales_ia. ` +
        `Formato esperado: { "openai_api_key": "sk-proj-..." }`
      );
    }

    // — Determinar nombre del proveedor desde el catálogo —
    const proveedorId = tipoProvider === 'stt' ? config.proveedor_stt_id
                      : tipoProvider === 'llm' ? config.proveedor_llm_id
                      :                          config.proveedor_tts_id; // 'tts'

    let nombreProveedor;

    if (proveedorId) {
      // — Consulta 2: catalogo_proveedores_ia —
      const catalogo = await prisma.catalogo_proveedores_ia.findUnique({
        where:  { id: proveedorId },
        select: { nombre: true }
      });

      if (!catalogo) {
        // FK apunta a registro eliminado (deleted_at soft-delete) → usar default
        console.warn(
          `[AIProviderFactory] proveedor_${tipoProvider}_id '${proveedorId}' ` +
          `no encontrado en catálogo para empresa ${empresaId}. ` +
          `Usando default: '${DEFAULTS_POR_TIPO[tipoProvider]}'`
        );
        nombreProveedor = DEFAULTS_POR_TIPO[tipoProvider];
      } else {
        nombreProveedor = catalogo.nombre;
      }
    } else {
      // Sin proveedor configurado → default por tipo
      nombreProveedor = DEFAULTS_POR_TIPO[tipoProvider];
      console.info(
        `[AIProviderFactory] Empresa ${empresaId} no tiene proveedor_${tipoProvider}_id. ` +
        `Usando default: '${nombreProveedor}'`
      );
    }

    // — Instanciar el provider correcto (polimorfismo real) —
    const fabricar = FABRICAS_PROVIDER[nombreProveedor];

    if (fabricar === undefined) {
      throw new NotImplementedError(
        `[AIProviderFactory] Proveedor desconocido: "${nombreProveedor}". ` +
        `No existe en el mapa FABRICAS_PROVIDER de MERCI. ` +
        `Registrados: ${Object.keys(FABRICAS_PROVIDER).join(', ')}`
      );
    }

    if (fabricar === null) {
      throw new NotImplementedError(
        `[AIProviderFactory] El proveedor "${nombreProveedor}" está en el catálogo ` +
        `pero su clase aún no ha sido implementada en MERCI. ` +
        `Implementados: ${
          Object.entries(FABRICAS_PROVIDER)
            .filter(([, fn]) => fn !== null)
            .map(([nombre]) => nombre)
            .join(', ')
        }`
      );
    }

    const provider = fabricar(apiKey.trim());

    // — Construir retorno unificado con fallbacks seguros —
    // temperatura_modelo viene como Decimal de Prisma → convertir a Number nativo JS
    // para evitar que el caller reciba un objeto Decimal (no serializable en JSON).
    const resultado = {
      provider,
      idioma:      config.idioma             ?? 'es',
      modelo:      config.modelo_ia          ?? 'gpt-4o',
      temperatura: parseFloat(config.temperatura_modelo ?? 0.7),
      voz:         config.voz_ia             ?? 'alloy',
    };

    // — Guardar en caché —
    this._cache.set(cacheKey, resultado);
    console.info(
      `[AIProviderFactory] '${nombreProveedor}' instanciado para empresa ` +
      `${empresaId} (tipo: ${tipoProvider}). Guardado en caché [${this._cache.size} total].`
    );

    return resultado;
  }

  // ─── registrarConsumo ──────────────────────────────────────────────────────

  /**
   * Calcula el costo final de una operación IA (aplicando el margen de MERCI)
   * y lo persiste en la tabla consumo_ia.
   *
   * Este método es el punto único de registro financiero de IA en MERCI.
   * Los Workers de STT, LLM y TTS lo llaman al finalizar cada operación,
   * pasando los parámetros de consumo específicos de su tipo.
   *
   * FÓRMULA DE COSTO FINAL:
   *   costo_base    = calculado según tipo (ver _calcularCostoBase)
   *   margen        = MERCI_MARGIN_PERCENTAGE / 100  (ej: 10% → 0.10)
   *   costo_final   = costo_base × (1 + margen)
   *   costo_estimado = parseFloat(costo_final.toFixed(6))  ← 6 decimales de precisión
   *
   * VARIABLES DE ENTORNO REQUERIDAS (.env):
   *   MERCI_MARGIN_PERCENTAGE     → % de margen sobre el costo base (default: 0)
   *   PRICE_OPENAI_STT_PER_MIN    → USD/minuto para Whisper       (default: 0.006)
   *   PRICE_OPENAI_LLM_INPUT_PER_1M  → USD/1M tokens entrada GPT  (default: 2.50)
   *   PRICE_OPENAI_LLM_OUTPUT_PER_1M → USD/1M tokens salida GPT   (default: 10.00)
   *   PRICE_OPENAI_TTS_PER_1M_CHARS  → USD/1M caracteres TTS      (default: 15.00)
   *
   * @param {Object} params
   * @param {string}  params.empresaId    - UUID de la empresa (MULTI-TENANT — obligatorio)
   * @param {string}  [params.llamadaId]  - UUID de la llamada asociada (puede ser null)
   * @param {string}  [params.proveedorId]- UUID del proveedor en catalogo_proveedores_ia
   * @param {string}  params.tipo         - 'stt' | 'llm' | 'tts' (para calcular costo)
   * @param {number}  [params.tokensEntrada=0] - STT: segundos; LLM: prompt_tokens
   * @param {number}  [params.tokensSalida=0]  - LLM: completion_tokens; STT/TTS: 0
   * @param {number}  [params.duracionSeg=0]   - Segundos de audio (STT — puede ser float)
   * @param {number}  [params.caracteres=0]    - Caracteres de texto sintetizado (TTS)
   *
   * @returns {Promise<Object>} Registro creado en consumo_ia con costo_estimado calculado
   *
   * @throws {Error} Si empresaId no se proporciona o la inserción en BD falla
   *
   * @example — Llamada desde Worker STT
   *   await AIProviderFactory.registrarConsumo({
   *     empresaId,
   *     llamadaId,
   *     proveedorId,
   *     tipo:         'stt',
   *     tokensEntrada: duracion_seg,   // segundos (convención Bina #4)
   *     tokensSalida:  0,
   *     duracionSeg:   duracion_seg,
   *     caracteres:    0
   *   });
   *
   * @example — Llamada desde Worker LLM
   *   await AIProviderFactory.registrarConsumo({
   *     empresaId,
   *     llamadaId,
   *     proveedorId,
   *     tipo:          'llm',
   *     tokensEntrada: llmResult.data.tokens_entrada,
   *     tokensSalida:  llmResult.data.tokens_salida,
   *     duracionSeg:   0,
   *     caracteres:    0
   *   });
   */
  async registrarConsumo({
    empresaId,
    llamadaId    = null,
    proveedorId  = null,
    tipo,
    tokensEntrada = 0,
    tokensSalida  = 0,
    duracionSeg   = 0,
    caracteres    = 0
  }) {
    // — Validaciones de entrada —
    if (!empresaId || typeof empresaId !== 'string' || !empresaId.trim()) {
      throw new Error('[AIProviderFactory.registrarConsumo] empresaId es obligatorio.');
    }
    if (!TIPOS_VALIDOS.has(tipo)) {
      throw new Error(
        `[AIProviderFactory.registrarConsumo] tipo inválido: "${tipo}". ` +
        `Valores permitidos: ${[...TIPOS_VALIDOS].join(', ')}`
      );
    }

    // — Calcular costo base según tipo —
    const costoBase = _calcularCostoBase(tipo, {
      tokensEntrada,
      tokensSalida,
      duracionSeg,
      caracteres
    });

    // — Aplicar margen de MERCI —
    // MERCI_MARGIN_PERCENTAGE: porcentaje entero (ej: 10 para 10%)
    const margenPct   = _envNum('MERCI_MARGIN_PERCENTAGE', 0);
    const margen      = margenPct / 100;
    const costoFinal  = costoBase * (1 + margen);

    // — Formatear a 6 decimales de precisión —
    // Coincide con DECIMAL(10,6) definido en la tabla consumo_ia.
    const costo_estimado = parseFloat(costoFinal.toFixed(6));

    // — tokens_entrada y tokens_salida son INT en la BD —
    // Redondear para evitar error de tipo Prisma si vienen como floats
    // (ej: duracionSeg = 12.7 segundos → tokens_entrada = 13)
    const tokens_entrada = Math.round(tokensEntrada);
    const tokens_salida  = Math.round(tokensSalida);

    // — Persistir en consumo_ia —
    const registro = await prisma.consumo_ia.create({
      data: {
        empresa_id:    empresaId,
        llamada_id:    llamadaId  ?? null,
        proveedor_id:  proveedorId ?? null,
        tokens_entrada,
        tokens_salida,
        costo_estimado
      }
    });

    console.info(
      `[AIProviderFactory] consumo_ia registrado | ` +
      `empresa: ${empresaId} | tipo: ${tipo} | ` +
      `tokens_in: ${tokens_entrada} | tokens_out: ${tokens_salida} | ` +
      `costo: $${costo_estimado} USD (margen ${margenPct}%)`
    );

    return registro;
  }

  // ─── Gestión de Caché ───────────────────────────────────────────────────────

  /**
   * Invalida el caché de una empresa específica (stt + llm + tts).
   * Debe llamarse cuando la empresa actualiza sus credenciales IA
   * o cambia de proveedor en configuraciones_empresa.
   *
   * @param {string} empresaId
   * @returns {number} Número de entradas eliminadas (0–3)
   */
  invalidarCache(empresaId) {
    let eliminados = 0;
    for (const tipo of TIPOS_VALIDOS) {
      if (this._cache.delete(`${empresaId}:${tipo}`)) eliminados++;
    }
    if (eliminados > 0) {
      console.info(
        `[AIProviderFactory] Caché invalidado: empresa ${empresaId} ` +
        `(${eliminados} entrada${eliminados > 1 ? 's' : ''} eliminada${eliminados > 1 ? 's' : ''}).`
      );
    }
    return eliminados;
  }

  /**
   * Vacía el caché completo de todos los providers de todas las empresas.
   * Útil en pruebas o al reiniciar el servidor.
   *
   * @returns {number} Total de entradas eliminadas
   */
  vaciarCache() {
    const total = this._cache.size;
    this._cache.clear();
    console.info(`[AIProviderFactory] Caché vaciado (${total} entrada${total !== 1 ? 's' : ''}).`);
    return total;
  }

  /**
   * Tamaño actual del caché. Útil para métricas y healthchecks.
   * @returns {number}
   */
  get tamañoCache() {
    return this._cache.size;
  }
}

// ─── Exports (Singleton) ──────────────────────────────────────────────────────
//
// CommonJS cachea los módulos automáticamente: todos los archivos que hagan
//   require('../providers/AIProviderFactory')
// obtienen la MISMA instancia y comparten el MISMO Map de caché en memoria.

module.exports = new AIProviderFactory();