/**
 * OpenAILLMProvider.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Proveedor LLM: OpenAI Chat Completions (GPT-4o y familia)
 * Ruta oficial: src/providers/llm/OpenAILLMProvider.js
 * Bina #4 — Johann & Kevin
 *
 * RESPONSABILIDAD ÚNICA:
 *   Conectar con la API de OpenAI Chat Completions para generar respuestas
 *   de texto a partir de un prompt de sistema y el mensaje del usuario.
 *   Este módulo NO toca la base de datos. Es un conector puro de API externa.
 *   La gestión de credenciales, el historial de llamada y el registro en
 *   consumo_ia son responsabilidad del llamador (worker/job correspondiente).
 *
 * DISEÑO MULTI-TURNO:
 *   El parámetro 'historial' permite inyectar turnos previos de la conversación
 *   telefónica entre el sistema y el cliente. Se inserta entre el mensaje
 *   'system' y el mensaje 'user' actual, respetando el contrato de la API:
 *
 *     [ system ] → [ historial[0] ] → [ historial[N] ] → [ user_actual ]
 *
 *   Cada item del historial debe seguir la estructura de OpenAI:
 *     { role: 'user' | 'assistant', content: string }
 *
 * TOKENS y COSTOS:
 *   Este provider retorna los tokens en bruto (prompt_tokens, completion_tokens).
 *   El cálculo monetario (costo_estimado en USD) se delega a la capa de negocio
 *   (Workers/Jobs) al momento de escribir en la tabla consumo_ia, ya que las
 *   tarifas varían por modelo y pueden actualizarse sin tocar este archivo.
 *
 *   Mapeo de campos al schema consumo_ia:
 *     tokens_entrada ← usage.prompt_tokens      (tokens del system + historial + user)
 *     tokens_salida  ← usage.completion_tokens  (tokens de la respuesta generada)
 *
 * COMPATIBILIDAD:
 *   OpenAI SDK v4+ (npm install openai)
 *   Node.js >= 18
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { OpenAI }   = require('openai');
const ILLMProvider = require('./ILLMProvider');

// ─── Constantes del Proveedor ─────────────────────────────────────────────────

/** Modelo por defecto. Sobreescribible vía configuraciones_empresa.modelo_ia */
const MODELO_DEFAULT      = 'gpt-4o';

/** Temperatura por defecto: balance entre creatividad y coherencia para IVR */
const TEMPERATURA_DEFAULT = 0.7;

/**
 * Límite de tokens por defecto optimizado para respuestas conversacionales
 * por voz (IVR). 150 tokens ≈ 2-3 oraciones cortas, fluidas y naturales
 * para síntesis de voz (TTS). Sobreescribible por el llamador.
 */
const MAX_TOKENS_DEFAULT  = 150;

/** Roles válidos en el historial de conversación según el contrato de OpenAI */
const ROLES_HISTORIAL_VALIDOS = new Set(['user', 'assistant']);

// ─── Clase Principal ──────────────────────────────────────────────────────────

/**
 * OpenAILLMProvider
 *
 * Implementación concreta de ILLMProvider para OpenAI Chat Completions.
 * Extiende la interfaz base garantizando que el contrato del sistema
 * (firma de método, shape de retorno) sea intercambiable con otros LLMs.
 *
 * @extends ILLMProvider
 *
 * @example — Turno único (primera interacción)
 *   const llm = new OpenAILLMProvider('sk-proj-...');
 *   const resultado = await llm.chat({
 *     promptSystem: 'Eres un agente de soporte de ACME S.A...',
 *     promptUser:   '¿Cuál es el horario de atención?'
 *   });
 *   // { success: true, data: { texto_generado, tokens_entrada, tokens_salida, modelo_usado } }
 *
 * @example — Multi-turno (conversación telefónica en progreso)
 *   const resultado = await llm.chat({
 *     promptSystem: 'Eres un agente de soporte...',
 *     historial: [
 *       { role: 'user',      content: '¿Cuál es el horario?' },
 *       { role: 'assistant', content: 'Atendemos de 9am a 6pm.' }
 *     ],
 *     promptUser: '¿Y los sábados?'
 *   });
 */
class OpenAILLMProvider extends ILLMProvider {

  /**
   * @param {string} apiKey - API key de OpenAI obtenida de
   *   configuraciones_empresa.credenciales_ia.openai_api_key
   * @throws {Error} Si apiKey no es un string no-vacío (falla rápido en instanciación)
   */
  constructor(apiKey) {
    super(); // Llamada obligatoria al constructor de ILLMProvider
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new Error(
        '[OpenAILLMProvider] API key inválida o no proporcionada. ' +
        'Verifica configuraciones_empresa.credenciales_ia.openai_api_key'
      );
    }
    this._client = new OpenAI({ apiKey: apiKey.trim() });
  }

  // ─── Helpers Privados ───────────────────────────────────────────────────────

  /**
   * Valida la estructura del historial de conversación antes de enviarlo a la API.
   * Falla rápido con mensajes accionables para facilitar el debugging.
   *
   * @param  {Array} historial
   * @throws {Error} Si el array o alguno de sus items tiene estructura inválida
   */
  _validarHistorial(historial) {
    if (!Array.isArray(historial)) {
      throw new Error(
        '[OpenAILLMProvider] "historial" debe ser un array. ' +
        'Formato esperado: [{ role: "user"|"assistant", content: "..." }]'
      );
    }

    for (let i = 0; i < historial.length; i++) {
      const item = historial[i];

      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(
          `[OpenAILLMProvider] historial[${i}] debe ser un objeto ` +
          `{ role: string, content: string }. Recibido: ${JSON.stringify(item)}`
        );
      }

      if (!ROLES_HISTORIAL_VALIDOS.has(item.role)) {
        throw new Error(
          `[OpenAILLMProvider] historial[${i}].role inválido: "${item.role}". ` +
          `Valores permitidos: ${[...ROLES_HISTORIAL_VALIDOS].join(', ')}`
        );
      }

      if (!item.content || typeof item.content !== 'string' || !item.content.trim()) {
        throw new Error(
          `[OpenAILLMProvider] historial[${i}].content debe ser un string no vacío.`
        );
      }
    }
  }

  // ─── API Pública ────────────────────────────────────────────────────────────

  /**
   * Genera una respuesta de texto usando OpenAI Chat Completions.
   * Implementa el método abstracto `chat()` definido en ILLMProvider.
   *
   * @param {Object}   params
   * @param {string}   params.promptSystem         - Instrucción de sistema que define
   *                                                 el comportamiento y personalidad del
   *                                                 agente virtual (rol: 'system')
   * @param {string}   params.promptUser           - Mensaje actual del cliente/usuario,
   *                                                 típicamente la transcripción del STT
   *                                                 (rol: 'user')
   * @param {Array}    [params.historial=[]]       - Turnos previos de la conversación.
   *                                                 Cada item: { role, content }.
   *                                                 Se inserta entre system y user_actual.
   * @param {string}   [params.modelo='gpt-4o']   - Modelo de OpenAI a usar. Leer desde
   *                                                 configuraciones_empresa.modelo_ia
   * @param {number}   [params.temperatura=0.7]   - Creatividad del modelo (0.0–2.0).
   *                                                 0.7 = balance coherencia/variedad para IVR
   * @param {number}   [params.maxTokens=150]     - Máximo de tokens en la respuesta.
   *                                                 150 = óptimo para voz (2-3 oraciones)
   *
   * @returns {Promise<Object>} API Envelope estándar MERCI:
   * {
   *   success: boolean,
   *   message: string,
   *   data: {
   *     texto_generado: string,  // Respuesta del agente lista para TTS
   *     tokens_entrada: number,  // usage.prompt_tokens  → escribir en consumo_ia
   *     tokens_salida:  number,  // usage.completion_tokens → escribir en consumo_ia
   *     modelo_usado:   string   // Modelo real usado → trazabilidad y auditoría IA
   *   } | null
   * }
   *
   * NOTA PARA EL LLAMADOR — Cálculo de costo_estimado (tarifas GPT-4o a Jun/2025):
   *   costo = (tokens_entrada / 1_000_000 * 2.50) + (tokens_salida / 1_000_000 * 10.00)
   *   Este cálculo debe hacerse en la capa de negocio (Worker/Job) al insertar en consumo_ia,
   *   ya que las tarifas son externas a este provider y pueden variar por modelo.
   */
  async chat({
    promptSystem,
    promptUser,
    historial    = [],
    modelo       = MODELO_DEFAULT,
    temperatura  = TEMPERATURA_DEFAULT,
    maxTokens    = MAX_TOKENS_DEFAULT
  } = {}) {

    // ── Validaciones de entrada (retornan envelope sin lanzar excepción) ──────

    if (!promptSystem || typeof promptSystem !== 'string' || !promptSystem.trim()) {
      return {
        success: false,
        message: '[OpenAILLMProvider] "promptSystem" es requerido y debe ser un string no vacío.',
        data:    null
      };
    }

    if (!promptUser || typeof promptUser !== 'string' || !promptUser.trim()) {
      return {
        success: false,
        message: '[OpenAILLMProvider] "promptUser" es requerido y debe ser un string no vacío.',
        data:    null
      };
    }

    try {
      // Validar el historial (lanza Error si hay items mal formados)
      this._validarHistorial(historial);

      // ── Construir el array de mensajes para la API ────────────────────────
      //
      // Estructura final enviada a OpenAI:
      //   1. system      → define quién es el agente y cómo debe comportarse
      //   2. ...historial → turnos previos user/assistant (vacío en primera llamada)
      //   3. user        → el mensaje actual del cliente (transcripción STT)
      //
      const messages = [
        { role: 'system', content: promptSystem.trim() },
        ...historial,
        { role: 'user',   content: promptUser.trim() }
      ];

      // ── Llamada a la API de OpenAI Chat Completions ───────────────────────
      const respuesta = await this._client.chat.completions.create({
        model:       modelo,
        messages,
        temperature: temperatura,
        max_tokens:  maxTokens
      });

      // ── Extraer y validar la respuesta ────────────────────────────────────
      const eleccion = respuesta.choices?.[0];
      if (!eleccion) {
        throw new Error(
          'La API de OpenAI retornó una respuesta sin opciones (choices vacío). ' +
          `Modelo: ${modelo}`
        );
      }

      const texto_generado  = (eleccion.message?.content ?? '').trim();
      const tokens_entrada  = respuesta.usage?.prompt_tokens     ?? 0;
      const tokens_salida   = respuesta.usage?.completion_tokens ?? 0;
      const finish_reason   = eleccion.finish_reason;

      // Advertencia de respuesta truncada — no es un error, pero el llamador
      // debería saberlo para ajustar maxTokens si el contexto lo requiere
      if (finish_reason === 'length') {
        console.warn(
          `[OpenAILLMProvider] ⚠ Respuesta truncada: se alcanzó max_tokens=${maxTokens}. ` +
          `Si la respuesta parece cortada, aumenta maxTokens en la llamada a chat().`
        );
      }

      return {
        success: true,
        message: 'Respuesta generada exitosamente.',
        data: {
          texto_generado,
          tokens_entrada, // ← para consumo_ia.tokens_entrada
          tokens_salida,  // ← para consumo_ia.tokens_salida
          modelo_usado: modelo  // ← trazabilidad: qué modelo generó esta respuesta
        }
      };

    } catch (error) {
      // Normalizar errores del SDK de OpenAI (APIError, AuthenticationError,
      // RateLimitError, InternalServerError, etc.)
      const codigo  = error?.status ?? error?.code ?? 'UNKNOWN';
      const mensaje = error?.message ?? 'Error desconocido en la API de OpenAI';

      return {
        success: false,
        message: `[OpenAILLMProvider] Error (${codigo}): ${mensaje}`,
        data:    null
      };
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = OpenAILLMProvider;
