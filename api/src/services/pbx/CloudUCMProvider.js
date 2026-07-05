const axios = require('axios')
const crypto = require('crypto')
const https = require('https')
const IPBXProvider = require('./IPBXProvider')
const prisma = require('../../config/database')

// Agente HTTPS que acepta certificados autofirmados
// CloudUCM en redes locales usa certificados no verificados
const httpsAgent = new https.Agent({ rejectUnauthorized: false })

// Hash MD5 — función utilitaria
const md5 = (value) =>
    crypto.createHash('md5').update(value).digest('hex')

// Limpia el array de cookies que devuelve CloudUCM
// y las une en un string de header Cookie válido
const parseCookieHeader = (cookieArray) => {
    if (!cookieArray) return ''
    if (Array.isArray(cookieArray)) {
        return cookieArray.map((c) => c.split(';')[0]).join('; ')
    }
    return cookieArray
}

class CloudUCMProvider extends IPBXProvider {
    constructor() {
        super()
        this.baseUrl = null
        this.usuario = null
        this.cookie = null   // Cookie de sesión activa
        this.expiresAt = null   // Timestamp de expiración de sesión
    }

    /**
     * Autenticación MD5 en dos pasos (lógica verificada contra UCM real):
     * 1. GET /cgi?action=challenge → obtiene challenge string
     * 2. GET /cgi?action=login&token=md5(challenge + password)
     *
     * Lee credenciales desde configuraciones_pbx en BD (Prisma)
     * @param {string} empresaId - UUID de la empresa
     */
    async connect(empresaId) {
        // Leer configuración PBX de la empresa desde BD
        const config = await prisma.configuraciones_pbx.findFirst({
        where: {
            empresa_id: empresaId,
            activo: true,
            deleted_at: null,
        },
        })

        if (!config) {
        const err = new Error('No existe configuración PBX activa para esta empresa')
        err.statusCode = 400
        throw err
        }

        this.baseUrl = config.api_url.replace(/\/$/, '')
        this.usuario = config.api_usuario

        // Obtener password desde el JSONB credenciales
        const apiPassword = config.credenciales?.password

        if (!apiPassword) {
        const err = new Error('No se encontró la contraseña del UCM en credenciales')
        err.statusCode = 400
        throw err
        }

        // Paso 1: obtener challenge
        const challengeRes = await axios.get(`${this.baseUrl}/cgi`, {
        params: { action: 'challenge', user: this.usuario },
        httpsAgent,
        })

        const challenge = challengeRes.data?.response?.challenge

        if (!challenge) {
        throw new Error('CloudUCM no devolvió challenge en la respuesta')
        }

        // Paso 2: login con token MD5(challenge + password)
        // NOTA: el orden correcto es challenge + password (verificado por tu compañera)
        const token = md5(challenge + apiPassword)

        const loginRes = await axios.get(`${this.baseUrl}/cgi`, {
        params: { action: 'login', user: this.usuario, token },
        httpsAgent,
        })

        if (loginRes.data?.status !== 0) {
        throw new Error(
            `CloudUCM login fallido. Status: ${loginRes.data?.status} — ${JSON.stringify(loginRes.data?.response)}`
        )
        }

        // Guardar cookie y tiempo de expiración
        this.cookie    = parseCookieHeader(loginRes.headers['set-cookie'])
        this.expiresAt = Date.now() + (30 * 60 * 1000) // 30 minutos

        return {
        status:   loginRes.data?.status,
        response: loginRes.data?.response,
        cookie:   this.cookie,
        }
    }

    /**
     * Reconecta si la sesión expiró
     * @param {string} empresaId
     */
    async _ensureSession(empresaId) {
        if (!this.cookie || Date.now() >= this.expiresAt) {
        await this.connect(empresaId)
        }
    }

    /**
     * Ejecuta una request GET autenticada contra CloudUCM
     */
    async _request(action, params = {}) {
        const res = await axios.get(`${this.baseUrl}/cgi`, {
        params: { action, ...params },
        headers: { Cookie: this.cookie },
        httpsAgent,
        })
        return res.data
    }

    /**
     * Lista extensiones registradas en el UCM
     * Equivalente a ucm.service.js → listarExtensionesUcm()
     * @param {string} empresaId
     */
    async getExtensions(empresaId) {
        await this._ensureSession(empresaId)

        const res = await this._request('listAccount')

        return {
        status:      res?.status,
        total:       res?.response?.account?.length || 0,
        extensiones: res?.response?.account || [],
        }
    }

    /**
     * Obtiene CDR (registros de llamadas) del UCM
     * Equivalente a ucm.service.js → obtenerCdr()
     * @param {string} empresaId
     * @param {Object} filtros - { numRecords, offset }
     */
    async getCDR(empresaId, filtros = {}) {
        await this._ensureSession(empresaId)

        const res = await this._request('cdrapi', {
        format:     'json',
        numRecords: filtros.numRecords || 50,
        offset:     filtros.offset    || 0,
        })

        return {
        status: res?.status,
        raw: res,
        registros: res?.response?.cdr_root
                    || res?.response?.cdr
                    || res?.cdr_root
                    || [],
        }
    }

    /**
     * Transfiere una llamada activa a una extensión
     * @param {string} empresaId
     * @param {string} callId   - ID de la llamada en UCM
     * @param {string} destino  - Extensión destino
     */
    async transferCall(empresaId, callId, destino) {
        await this._ensureSession(empresaId)
        return this._request('transfer', { callid: callId, to: destino })
    }

    /**
     * Obtiene grabación de una llamada bajo demanda (recapi)
     * @param {string} empresaId
     * @param {string} callId
     * @returns {Promise}
     */
    async getRecording(empresaId, callId) {
        await this._ensureSession(empresaId)

        const res = await axios.get(`${this.baseUrl}/cgi`, {
        params: { action: 'recapi', callid: callId },
        headers: { Cookie: this.cookie },
        responseType: 'arraybuffer',
        httpsAgent,
        })

        return Buffer.from(res.data)
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async uploadPrompt(empresaId, filename, audioBuffer) {
        await this._ensureSession(empresaId)
        
        // Se usa FormData porque la API del UCM requiere multipart/form-data para archivos
        const FormData = require('form-data');
        const form = new FormData();
        form.append('action', 'uploadfile');
        form.append('type', 'ivrprompt');
        form.append('filename', audioBuffer, { filename, contentType: 'audio/wav' });

        const res = await axios.post(`${this.baseUrl}/cgi`, form, {
            headers: { 
                ...form.getHeaders(),
                Cookie: this.cookie 
            },
            httpsAgent
        });
        return res.data;
    }

    /**
     * Reproduce un Custom Prompt en una llamada activa
     */
    async playPrompt(empresaId, callId, filename) {
        await this._ensureSession(empresaId)
        // La acción playprompt o ivrplay depende de la versión del firmware del UCM
        return this._request('playprompt', { callid: callId, prompt: filename });
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    
    /**
     * Verifica que la conexión sigue activa
     * @param {string} empresaId
     */
    async ping(empresaId) {
        try {
        await this._ensureSession(empresaId)
        const res = await this._request('getSystemStatus')
        return res?.status === 0
        } catch {
        return false
        }
    }
}

module.exports = CloudUCMProvider