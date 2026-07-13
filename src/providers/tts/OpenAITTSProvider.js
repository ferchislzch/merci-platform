/**
 * OpenAITTSProvider.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Proveedor TTS: OpenAI Text-To-Speech (tts-1 / tts-1-hd)
 * Ruta oficial: src/providers/tts/OpenAITTSProvider.js
 * Bina #4 — Johann & Kevin
 *
 * RESPONSABILIDAD ÚNICA:
 *   1. Recibir texto plano generado por el LLM.
 *   2. Llamar a la API de OpenAI TTS para convertir ese texto en audio.
 *   3. Resamplear el audio generado (24kHz) a 8kHz, 16-bit, Mono PCM WAV,
 *      que es el estándar G.711 requerido por CloudUCM/Asterisk para telefonía.
 *   4. Retornar el Buffer de audio procesado listo para ser subido a CloudUCM.
 *
 * IMPORTANTE — PREREQUISITO DEL SERVIDOR HOST:
 *   Este provider requiere que 'ffmpeg' esté instalado y disponible en el
 *   PATH del sistema operativo donde corra el servidor Node.js.
 *   Instalación:
 *     · Ubuntu/Debian: sudo apt-get install -y ffmpeg
 *     · macOS:         brew install ffmpeg
 *     · Docker:        RUN apt-get install -y ffmpeg  (en el Dockerfile)
 *
 * POR QUÉ RESAMPLING ES OBLIGATORIO:
 *   OpenAI TTS genera audio a 24,000 Hz (24kHz). Los sistemas PBX Grandstream
 *   CloudUCM son estrictos con el formato de audio y esperan prompts en el
 *   estándar de telefonía G.711: 8,000 Hz (8kHz), 16-bit, Mono, PCM WAV.
 *   Sin esta conversión, el audio se reproduciría a velocidad incorrecta
 *   o CloudUCM rechazaría el archivo al subirlo como Custom Prompt.
 *
 * FLUJO DE INTEGRACIÓN CON CloudUCM (responsabilidad del Worker, no de aquí):
 *   [Este provider] → audio_buffer (8kHz WAV)
 *         ↓
 *   [Worker] Sube el buffer como archivo a CloudUCM (upload Custom Prompt IVR)
 *         ↓
 *   [Worker] Llama playPromptByOrg con el nombre del archivo recién subido
 *         ↓
 *   CloudUCM reproduce el audio en la llamada telefónica activa
 *
 * MODELO DE COSTOS TTS (convención Bina #4):
 *   OpenAI TTS cobra por CARACTERES de texto, no por tokens.
 *     tts-1    → $15.00 USD / 1,000,000 caracteres
 *     tts-1-hd → $30.00 USD / 1,000,000 caracteres
 *   El campo 'data.caracteres' permite al Worker calcular 'costo_estimado'
 *   y mapearlo a 'consumo_ia.tokens_entrada' (caracteres como "unidad de entrada").
 *   Cálculo delegado al Worker: (caracteres / 1_000_000) * tarifa_por_modelo
 *
 * CAJA NEGRA:
 *   Este módulo NO toca la base de datos. Es un conector puro.
 *   Las credenciales las gestiona el Worker, que instancia este provider.
 *
 * COMPATIBILIDAD:
 *   OpenAI SDK v4+ (npm install openai)
 *   ffmpeg >= 4.0 instalado en el sistema operativo host
 *   Node.js >= 18
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { OpenAI }   = require('openai');
const { spawn }    = require('child_process'); // Nativo de Node.js — no requiere instalación
const ITTSProvider = require('./ITTSProvider');

// ─── Constantes del Proveedor ─────────────────────────────────────────────────

const MODELO_TTS_DEFAULT = 'tts-1';

/**
 * Voces disponibles en OpenAI TTS.
 * Referencia: https://platform.openai.com/docs/guides/text-to-speech
 */
const VOCES_VALIDAS = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);

/**
 * Formatos de audio que acepta la API de OpenAI TTS.
 * Internamente siempre pedimos WAV (mejor compatibilidad con ffmpeg),
 * pero validamos el parámetro del llamador por consistencia de API.
 */
const FORMATOS_OPENAI_VALIDOS = new Set(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']);

/**
 * Límite de caracteres por solicitud impuesto por la API de OpenAI TTS.
 * Textos más largos deben dividirse antes de llamar a este provider.
 */
const LIMITE_CARACTERES_OPENAI = 4096;

/**
 * Parámetros de audio objetivo para telefonía G.711 (CloudUCM / Asterisk).
 * Estos valores son fijos — no deben modificarse sin probar la compatibilidad con el UCM.
 */
const TELEFONIA = {
  SAMPLE_RATE: 8000,      // Hz — estándar G.711 para voz telefónica
  CANALES:     1,         // Mono — las llamadas telefónicas son mono
  CODEC:       'pcm_s16le', // PCM 16-bit little-endian — máxima compatibilidad PBX
  FORMATO:     'wav'      // Contenedor WAV con header estándar
};

// ─── Clase Principal ──────────────────────────────────────────────────────────

/**
 * OpenAITTSProvider
 *
 * Implementación concreta de ITTSProvider para OpenAI Text-To-Speech.
 * Extiende la interfaz base garantizando polimorfismo con otros providers TTS
 * (ej: ElevenLabsTTSProvider) sin modificar el código consumidor.
 *
 * Incluye conversión obligatoria a G.711 (8kHz WAV) para compatibilidad
 * estricta con Grandstream CloudUCM/Asterisk.
 *
 * @extends ITTSProvider
 *
 * @example
 *   const tts = new OpenAITTSProvider('sk-proj-...');
 *   const resultado = await tts.synthesize(
 *     'Bienvenido a ACME. ¿En qué le puedo ayudar?',
 *     { voz: 'alloy' }
 *   );
 *   // resultado.data.audio_buffer → Buffer de 8kHz WAV listo para CloudUCM
 *   // resultado.data.caracteres  → 44 (para calcular costo en el Worker)
 */
class OpenAITTSProvider extends ITTSProvider {

  /**
   * @param {string} apiKey - API key de OpenAI obtenida de
   *   configuraciones_empresa.credenciales_ia.openai_api_key
   * @throws {Error} Si apiKey no es un string no-vacío (falla rápido al instanciar)
   */
  constructor(apiKey) {
    super(); // Llamada obligatoria al constructor de ITTSProvider
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new Error(
        '[OpenAITTSProvider] API key inválida o no proporcionada. ' +
        'Verifica configuraciones_empresa.credenciales_ia.openai_api_key'
      );
    }
    this._client = new OpenAI({ apiKey: apiKey.trim() });
  }

  // ─── Helpers Privados ───────────────────────────────────────────────────────

  /**
   * Resamplea un Buffer de audio a 8kHz, 16-bit, Mono PCM WAV
   * usando ffmpeg mediante pipes en memoria (sin archivos temporales en disco).
   *
   * El proceso es: [Buffer entrada] → stdin de ffmpeg → stdout de ffmpeg → [Buffer salida]
   * No hay escritura a disco — todo ocurre en RAM para maximizar rendimiento.
   *
   * NOTA: EPIPE en stdin es esperado y no es un error — ocurre cuando ffmpeg
   * termina de leer el input antes de que cerremos el pipe.
   *
   * @param  {Buffer} inputBuffer - Audio crudo de OpenAI TTS (24kHz, cualquier formato)
   * @returns {Promise<Buffer>} Audio resampleado: 8kHz, 16-bit, Mono, PCM WAV
   * @throws {Error} Si ffmpeg no está instalado o si el resampling falla
   */
  _resamplearParaTelefonia(inputBuffer) {
    return new Promise((resolve, reject) => {
      /**
       * Argumentos de ffmpeg para conversión a estándar G.711:
       *   -y              → Sobreescribir output sin preguntar (opera en pipes)
       *   -i pipe:0       → Leer audio de stdin (no de un archivo en disco)
       *   -ar 8000        → Resamplear a 8,000 Hz (estándar telefonía G.711)
       *   -ac 1           → Forzar Mono (1 canal — telefonía siempre es mono)
       *   -acodec pcm_s16le → PCM 16-bit little-endian (máxima compatibilidad PBX)
       *   -f wav          → Contenedor WAV con header estándar
       *   pipe:1          → Escribir resultado en stdout (no en archivo)
       */
      const proceso = spawn('ffmpeg', [
        '-y',
        '-i',      'pipe:0',
        '-ar',     String(TELEFONIA.SAMPLE_RATE),
        '-ac',     String(TELEFONIA.CANALES),
        '-acodec', TELEFONIA.CODEC,
        '-f',      TELEFONIA.FORMATO,
        'pipe:1'
      ]);

      const chunksSalida = [];
      const chunksError  = [];

      // Acumular el audio procesado desde stdout de ffmpeg
      proceso.stdout.on('data', (chunk) => chunksSalida.push(chunk));

      // Acumular stderr para diagnóstico en caso de error
      // (ffmpeg escribe su progreso en stderr incluso en ejecución exitosa)
      proceso.stderr.on('data', (chunk) => chunksError.push(chunk));

      proceso.on('close', (codigoSalida) => {
        if (codigoSalida !== 0) {
          // Tomar los últimos 500 chars del stderr para el mensaje de error
          // (el inicio de stderr suele ser el banner de ffmpeg, no el error real)
          const mensajeError = Buffer.concat(chunksError)
            .toString('utf8')
            .slice(-500)
            .trim();

          return reject(new Error(
            `[OpenAITTSProvider] ffmpeg terminó con código ${codigoSalida}. ` +
            `Detalle: ${mensajeError}`
          ));
        }

        const audioResampleado = Buffer.concat(chunksSalida);

        if (audioResampleado.length === 0) {
          return reject(new Error(
            '[OpenAITTSProvider] ffmpeg produjo un buffer de audio vacío. ' +
            'Verifica que el archivo de entrada es un formato de audio válido.'
          ));
        }

        resolve(audioResampleado);
      });

      proceso.on('error', (err) => {
        if (err.code === 'ENOENT') {
          // Error más común — ffmpeg no está instalado en el servidor host
          return reject(new Error(
            '[OpenAITTSProvider] ffmpeg no encontrado en el PATH del sistema. ' +
            'El servidor host debe tenerlo instalado. ' +
            'Ubuntu/Debian: sudo apt-get install -y ffmpeg | ' +
            'macOS: brew install ffmpeg | ' +
            'Docker: RUN apt-get install -y ffmpeg'
          ));
        }
        reject(new Error(`[OpenAITTSProvider] Error al iniciar ffmpeg: ${err.message}`));
      });

      // EPIPE: ocurre cuando ffmpeg cierra stdin antes de que terminemos de escribir.
      // Es un comportamiento normal cuando ffmpeg detecta el fin del stream de entrada.
      // No debe tratarse como un error fatal del proceso.
      proceso.stdin.on('error', (err) => {
        if (err.code !== 'EPIPE') {
          reject(new Error(`[OpenAITTSProvider] Error en pipe de entrada a ffmpeg: ${err.message}`));
        }
      });

      // Escribir el audio de OpenAI en el stdin de ffmpeg y cerrar el pipe
      proceso.stdin.write(inputBuffer);
      proceso.stdin.end();
    });
  }

  // ─── API Pública ────────────────────────────────────────────────────────────

  /**
   * Sintetiza texto a audio de voz y lo convierte al formato G.711
   * requerido por CloudUCM para reproducción en llamadas telefónicas.
   * Implementa el método abstracto `synthesize()` definido en ITTSProvider.
   *
   * @param {string} texto              - Texto a sintetizar. Máximo 4096 caracteres.
   *                                      Típicamente: la respuesta generada por OpenAILLMProvider
   * @param {Object} [options={}]       - Opciones de síntesis
   * @param {string} [options.voz]      - Voz de OpenAI TTS. Default: 'alloy'
   *                                      Opciones: alloy, echo, fable, onyx, nova, shimmer
   * @param {string} [options.formato]  - Formato solicitado a OpenAI. Default: 'wav'
   *                                      El output final SIEMPRE será WAV 8kHz
   *                                      (el resampling lo garantiza independientemente).
   * @param {string} [options.modelo]   - Modelo TTS de OpenAI. Default: 'tts-1'
   *                                      tts-1: optimizado para velocidad (recomendado para IVR)
   *                                      tts-1-hd: mayor calidad, más latencia y costo
   *
   * @returns {Promise<Object>} API Envelope estándar MERCI:
   * {
   *   success: boolean,
   *   message: string,
   *   data: {
   *     audio_buffer: Buffer,  // PCM WAV 8kHz, 16-bit, Mono — listo para subir a CloudUCM
   *     formato:      string,  // Siempre 'wav' (estándar telefonía post-resampling)
   *     caracteres:   number   // len(texto) → para calcular costo en consumo_ia:
   *                            //   tts-1:    (caracteres / 1_000_000) * 15.00 USD
   *                            //   tts-1-hd: (caracteres / 1_000_000) * 30.00 USD
   *   } | null
   * }
   *
   * NOTA PARA EL WORKER — Mapeo a consumo_ia (convención Bina #4):
   *   tokens_entrada ← data.caracteres  (caracteres de texto como "unidad de entrada")
   *   tokens_salida  ← 0                (TTS no genera tokens de salida)
   *   costo_estimado ← calculado por el Worker según modelo y tarifas vigentes
   */
  async synthesize(texto, options = {}) {

    // Extraer opciones con valores por defecto desde el objeto 'options'
    const voz    = options.voz    || 'alloy';
    const formato = options.formato || 'wav';
    const modelo  = options.modelo  || MODELO_TTS_DEFAULT;

    // ── Validaciones de entrada ───────────────────────────────────────────────

    if (!texto || typeof texto !== 'string' || !texto.trim()) {
      return {
        success: false,
        message: '[OpenAITTSProvider] "texto" es requerido y debe ser un string no vacío.',
        data:    null
      };
    }

    const textoLimpio = texto.trim();

    if (textoLimpio.length > LIMITE_CARACTERES_OPENAI) {
      return {
        success: false,
        message: (
          `[OpenAITTSProvider] El texto supera el límite de ${LIMITE_CARACTERES_OPENAI} ` +
          `caracteres de la API de OpenAI TTS (recibido: ${textoLimpio.length} caracteres). ` +
          `Divide el texto en segmentos más cortos antes de llamar a este provider.`
        ),
        data: null
      };
    }

    if (!VOCES_VALIDAS.has(voz)) {
      return {
        success: false,
        message: (
          `[OpenAITTSProvider] Voz inválida: "${voz}". ` +
          `Voces disponibles: ${[...VOCES_VALIDAS].join(', ')}`
        ),
        data: null
      };
    }

    if (!FORMATOS_OPENAI_VALIDOS.has(formato)) {
      return {
        success: false,
        message: (
          `[OpenAITTSProvider] Formato de audio inválido: "${formato}". ` +
          `Formatos aceptados: ${[...FORMATOS_OPENAI_VALIDOS].join(', ')}`
        ),
        data: null
      };
    }

    try {
      // ── Paso 1: Generar audio con OpenAI TTS ─────────────────────────────
      //
      // Siempre solicitamos WAV a OpenAI, independientemente del parámetro
      // 'formato' recibido. Razón: WAV (PCM sin compresión) es el formato
      // más transparente para ffmpeg durante el resampling, evitando artefactos
      // de descompresión/recompresión que podrían degradar la calidad de voz.
      const respuesta = await this._client.audio.speech.create({
        model:           modelo,
        voice:           voz,
        input:           textoLimpio,
        response_format: 'wav'
      });

      // Convertir el Response del SDK v4 a Buffer de Node.js
      const audioOriginal24kHz = Buffer.from(await respuesta.arrayBuffer());

      // ── Paso 2: Resamplear a estándar G.711 para telefonía ────────────────
      //
      // OpenAI TTS genera WAV a 24,000 Hz (24kHz).
      // CloudUCM/Asterisk requiere 8,000 Hz (8kHz), 16-bit, Mono.
      // Esta conversión es OBLIGATORIA para compatibilidad con el PBX Grandstream.
      const audio8kHz = await this._resamplearParaTelefonia(audioOriginal24kHz);

      return {
        success: true,
        message: 'Audio generado y convertido a formato de telefonía (8kHz WAV) exitosamente.',
        data: {
          audio_buffer: audio8kHz,      // Buffer PCM 8kHz, 16-bit, Mono — listo para CloudUCM
          formato:      TELEFONIA.FORMATO, // Siempre 'wav' post-resampling
          caracteres:   textoLimpio.length // Para cálculo de costo_estimado en el Worker
        }
      };

    } catch (error) {
      // Normalizar errores del SDK de OpenAI y de ffmpeg
      const codigo  = error?.status ?? error?.code ?? 'UNKNOWN';
      const mensaje = error?.message ?? 'Error desconocido';

      return {
        success: false,
        message: `[OpenAITTSProvider] Error (${codigo}): ${mensaje}`,
        data:    null
      };
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = OpenAITTSProvider;