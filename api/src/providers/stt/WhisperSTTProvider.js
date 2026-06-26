/**
 * WhisperSTTProvider.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Proveedor STT: OpenAI Whisper
 * Ruta oficial: src/providers/stt/WhisperSTTProvider.js
 * Bina #4 — Johann & Kevin
 *
 * RESPONSABILIDAD ÚNICA:
 *   Conectar con la API de OpenAI Whisper para transcribir audio a texto.
 *   Este módulo NO toca la base de datos. Es un conector puro de API externa.
 *   La gestión de credenciales y el acceso a Prisma es responsabilidad del
 *   consumidor (sttProceso.job.js).
 *
 * CONVENCIÓN STT vs LLM (tokens_entrada / tokens_salida):
 *   Whisper no maneja "tokens". Para mantener compatibilidad con la tabla
 *   consumo_ia (que comparte estructura con proveedores LLM como GPT-4o),
 *   Bina #4 adopta la siguiente convención interna:
 *
 *     tokens_entrada  → duración del audio en SEGUNDOS
 *     tokens_salida   → siempre 0 (Whisper no genera tokens de salida)
 *     costo_estimado  → (duracion_seg / 60) × $0.006 USD/minuto (tarifa Whisper)
 *
 *   Esta convención debe documentarse en los reportes de consumo y en la
 *   función fn_consumo_ia_mes() para distinguir registros STT de registros LLM.
 *
 * COMPATIBILIDAD:
 *   OpenAI SDK v4+ (npm install openai)
 *   Node.js >= 18 (usa globalThis.fetch y ReadableStream nativos)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { OpenAI, toFile } = require('openai');
const fs                 = require('fs');

// ─── Constantes del Proveedor ─────────────────────────────────────────────────

const WHISPER_MODEL          = 'whisper-1';
const COSTO_POR_MINUTO_USD   = 0.006; // Tarifa oficial Whisper: $0.006 / minuto

// Formatos de audio soportados por Whisper API (para validación defensiva)
const FORMATOS_AUDIO_VALIDOS = new Set([
  'flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'
]);

// ─── Clase Principal ──────────────────────────────────────────────────────────

/**
 * WhisperSTTProvider
 *
 * Conector de integración con la API de OpenAI Whisper (Speech-to-Text).
 * Se instancia con la API key de la empresa y expone el método `transcribir()`.
 *
 * @example
 *   const provider = new WhisperSTTProvider('sk-proj-...');
 *   const resultado = await provider.transcribir({
 *     audio:  audioBuffer,
 *     idioma: 'es'
 *   });
 *   // resultado → { success: true, message: '...', data: { transcripcion, ... } }
 *   // La duración y el costo se obtienen automáticamente de la respuesta de Whisper.
 */
class WhisperSTTProvider {

  /**
   * @param {string} apiKey - API key de OpenAI obtenida de
   *   configuraciones_empresa.credenciales_ia.openai_api_key
   * @throws {Error} Si apiKey no es un string no-vacío
   */
  constructor(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new Error(
        '[WhisperSTTProvider] API key inválida o no proporcionada. ' +
        'Verifica configuraciones_empresa.credenciales_ia.openai_api_key'
      );
    }
    this._client = new OpenAI({ apiKey: apiKey.trim() });
  }

  // ─── Helpers Privados ───────────────────────────────────────────────────────

  /**
   * Resuelve la extensión del archivo de audio y la valida contra los
   * formatos aceptados por Whisper.
   *
   * @param  {string} nombreArchivo  - Nombre del archivo, ej: 'audio_call.mp3'
   * @returns {{ extension: string, mimeType: string }}
   * @throws {Error} Si la extensión no está soportada por Whisper
   */
  _resolverFormatoAudio(nombreArchivo) {
    const extension = (nombreArchivo.split('.').pop() ?? 'mp3').toLowerCase();
    if (!FORMATOS_AUDIO_VALIDOS.has(extension)) {
      throw new Error(
        `[WhisperSTTProvider] Formato de audio no soportado: '.${extension}'. ` +
        `Formatos válidos: ${[...FORMATOS_AUDIO_VALIDOS].join(', ')}`
      );
    }
    // Mapa de extensión → MIME type para el SDK de OpenAI
    const mimeMap = {
      mp3: 'audio/mpeg', mp4: 'audio/mp4',  mpeg: 'audio/mpeg',
      mpga:'audio/mpeg', m4a: 'audio/mp4',  ogg:  'audio/ogg',
      oga: 'audio/ogg',  wav: 'audio/wav',   webm: 'audio/webm',
      flac:'audio/flac'
    };
    return { extension, mimeType: mimeMap[extension] ?? 'audio/mpeg' };
  }

  /**
   * Calcula el costo estimado de una transcripción Whisper.
   *
   * CONVENCIÓN STT: La duración en segundos es nuestro equivalente a
   * "tokens de entrada" para registros de tipo STT en consumo_ia.
   *
   * @param  {number} duracionSeg  - Duración del audio en segundos
   * @returns {{ tokens_entrada: number, tokens_salida: number, costo_estimado: number }}
   */
  _calcularConsumo(duracionSeg) {
    const segundos      = Math.max(0, duracionSeg ?? 0);
    const costoEstimado = parseFloat(
      ((segundos / 60) * COSTO_POR_MINUTO_USD).toFixed(6)
    );
    return {
      tokens_entrada: segundos,  // CONVENCIÓN: segundos de audio como "tokens"
      tokens_salida:  0,         // Whisper no genera tokens de salida
      costo_estimado: costoEstimado
    };
  }

  // ─── API Pública ────────────────────────────────────────────────────────────

  /**
   * Transcribe un archivo de audio a texto usando OpenAI Whisper.
   *
   * Utiliza `response_format: 'verbose_json'` para que OpenAI retorne
   * automáticamente la duración exacta del audio (`response.duration`).
   * Esto elimina la dependencia del llamador de conocer la duración de
   * antemano y garantiza que el cálculo de facturación sea 100% preciso.
   *
   * @param {Object}         params
   * @param {Buffer|string}  params.audio           - Buffer del audio O ruta
   *                                                  absoluta al archivo en disco
   * @param {string}         [params.idioma]        - Código ISO 639-1. Default: 'es'
   * @param {string}         [params.nombreArchivo] - Nombre del archivo con extensión.
   *                                                  Default: 'audio.mp3'
   *
   * @returns {Promise<Object>} API Envelope estándar MERCI:
   * {
   *   success: boolean,
   *   message: string,
   *   data: {
   *     transcripcion:  string,   // Texto transcrito (vacío si no hubo voz)
   *     duracion_seg:   number,   // Duración real reportada por Whisper (verbose_json)
   *     tokens_entrada: number,   // [CONVENCIÓN STT] Duración en segundos
   *     tokens_salida:  number,   // Siempre 0 para STT
   *     costo_estimado: number    // USD con 6 decimales de precisión
   *   } | null
   * }
   */
  async transcribir({
    audio,
    idioma        = 'es',
    nombreArchivo = 'audio.mp3'
  }) {
    // — Validación de entrada —
    if (!audio) {
      return {
        success: false,
        message: '[WhisperSTTProvider] El parámetro "audio" es requerido.',
        data: null
      };
    }

    try {
      // — Preparar el archivo para el SDK de OpenAI —
      let archivoParaApi;

      if (Buffer.isBuffer(audio)) {
        // Buffer en memoria → File-like object que acepta el SDK
        const { mimeType } = this._resolverFormatoAudio(nombreArchivo);
        archivoParaApi = await toFile(audio, nombreArchivo, { type: mimeType });

      } else if (typeof audio === 'string') {
        // Ruta en disco → ReadStream (válido para la API de Whisper)
        if (!fs.existsSync(audio)) {
          throw new Error(`Archivo de audio no encontrado en: ${audio}`);
        }
        archivoParaApi = fs.createReadStream(audio);

      } else {
        throw new Error(
          '"audio" debe ser un Buffer de Node.js o una ruta absoluta a un archivo.'
        );
      }

      // — Llamada a OpenAI Whisper —
      // 'verbose_json' hace que Whisper retorne metadatos extendidos, incluyendo
      // 'duration': la duración real del audio en segundos medida por el modelo.
      // Esto elimina la dependencia de que el llamador conozca la duración de antemano
      // y garantiza que el cálculo de facturación use el valor exacto de la API.
      const respuesta = await this._client.audio.transcriptions.create({
        file:            archivoParaApi,
        model:           WHISPER_MODEL,
        language:        idioma,
        response_format: 'verbose_json' // Retorna { text, duration, language, segments, ... }
      });

      const transcripcion = (respuesta.text ?? '').trim();

      // Extraer la duración real reportada por Whisper.
      // Fallback a 0 como defensa ante respuestas atípicas (audio silencioso, etc.)
      const duracionReal = typeof respuesta.duration === 'number' && respuesta.duration > 0
        ? respuesta.duration
        : 0;

      const consumo = this._calcularConsumo(duracionReal);

      return {
        success: true,
        message: 'Transcripción completada exitosamente.',
        data: {
          transcripcion,
          duracion_seg:   duracionReal, // Duración real reportada por Whisper (verbose_json)
          ...consumo
        }
      };

    } catch (error) {
      // Normalizar errores del SDK de OpenAI (APIError, AuthenticationError, etc.)
      const codigo  = error?.status   ?? error?.code   ?? 'UNKNOWN';
      const mensaje = error?.message  ?? 'Error desconocido en la API de Whisper';

      return {
        success: false,
        message: `[WhisperSTTProvider] Error (${codigo}): ${mensaje}`,
        data: null
      };
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = WhisperSTTProvider;
