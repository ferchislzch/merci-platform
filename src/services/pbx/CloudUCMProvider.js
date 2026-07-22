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

// ─── FIX [Fase 1]: migración de GET /cgi (legacy) a POST /api (formato oficial) ──
//
// DIAGNÓSTICO CONFIRMADO EN PRUEBAS REALES (2026-07-21):
//   El endpoint legacy GET /cgi?action=... respondía el "challenge" con status 0
//   para CUALQUIER usuario (incluso uno recién creado, con permisos "All",
//   contraseña verificada carácter por carácter contra el panel), pero el
//   "login" SIEMPRE fallaba con status -37 "Wrong account or password!".
//   Se probó exactamente el mismo usuario/contraseña/challenge con el formato
//   oficial de la documentación (POST + JSON a /api) y el login funcionó al
//   primer intento (status 0 + cookie real).
//
//   Conclusión: en CloudUCM hosted, los usuarios creados en
//   "Integrations > API Configuration > HTTPS API Settings (New)" solo se
//   validan contra el endpoint NUEVO (POST /api con body JSON). El endpoint
//   viejo (GET /cgi) es el mecanismo legacy y no los reconoce para login,
//   aunque sí responda el challenge de forma genérica.
//
// Por eso: todas las requests ahora son POST a `${baseUrl}/api` con el body
// envuelto en { request: {...} }, tal como documenta el manual oficial de
// Grandstream (IPPBX-HTTPS-API-Documentation-Center). Se agrega además el
// parámetro "version" en el challenge, tal como recomienda esa misma doc.
//
// La respuesta llega también en la forma { response: {...}, status: N },
// igual que antes — por eso el resto de los métodos (getExtensions, getCDR,
// etc.) no necesitaron cambios en cómo LEEN la respuesta, solo en cómo se
// ENVÍA la request.
const API_VERSION = '1.0'

class CloudUCMProvider extends IPBXProvider {
    constructor() {
        super()
        this.baseUrl = null
        this.usuario = null
        this.cookie = null   // Cookie de sesión activa
        this.expiresAt = null   // Timestamp de expiración de sesión
    }

    /**
     * Autenticación MD5 en dos pasos (formato oficial POST + JSON, verificado
     * contra UCM hosted real el 2026-07-21):
     * 1. POST /api  { request: { action: 'challenge', user, version } }
     * 2. POST /api  { request: { action: 'login', user, token } }
     *    donde token = MD5(challenge + password)
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

        // Paso 1: obtener challenge — POST + JSON a /api (formato oficial)
        const challengeRes = await axios.post(
        `${this.baseUrl}/api`,
        { request: { action: 'challenge', user: this.usuario, version: API_VERSION } },
        { httpsAgent }
        )

        const challenge = challengeRes.data?.response?.challenge

        if (!challenge) {
        throw new Error('CloudUCM no devolvió challenge en la respuesta')
        }

        // Paso 2: login con token MD5(challenge + password) — POST + JSON a /api
        // NOTA: el orden correcto es challenge + password (confirmado contra
        // la documentación oficial de Grandstream y contra el UCM real)
        const token = md5(challenge + apiPassword)

        const loginRes = await axios.post(
        `${this.baseUrl}/api`,
        { request: { action: 'login', user: this.usuario, token } },
        { httpsAgent }
        )

        if (loginRes.data?.status !== 0) {
        throw new Error(
            `CloudUCM login fallido. Status: ${loginRes.data?.status} — ${JSON.stringify(loginRes.data?.response)}`
        )
        }

        // Guardar cookie y tiempo de expiración
        // NOTA: la doc oficial indica que la cookie expira a los 10 minutos
        // (no 30). Se ajusta el margen a 9 min para renovar con colchón antes
        // de que el UCM la invalide.
        this.cookie    = loginRes.data?.response?.cookie
        this.expiresAt = Date.now() + (9 * 60 * 1000) // 9 minutos (cookie real expira en 10)

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
     * Ejecuta una request autenticada contra CloudUCM — POST + JSON a /api,
     * incluyendo la cookie de sesión dentro del body (formato oficial),
     * no como header.
     * @param {string} action - acción a ejecutar (ej. 'listAccount', 'cdrapi')
     * @param {Object} params - parámetros adicionales de la acción
     */
    async _request(action, params = {}) {
        const res = await axios.post(
        `${this.baseUrl}/api`,
        { request: { action, cookie: this.cookie, ...params } },
        { httpsAgent }
        )
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
     *
     * OJO [pendiente Fase 2]: la doc oficial de recapi (CDR/REC API Guide)
     * indica que los parámetros son `filedir` y `filename`, no `callid`.
     * Este método se deja funcionalmente igual que antes (por callId) porque
     * cambiar la firma es una decisión de Fase 2 (contrato real de grabación),
     * no de este fix de Fase 1 (formato del endpoint). Ver runbook.
     *
     * recapi además devuelve el binario directamente (no JSON), así que no
     * puede usar _request() (que asume JSON) — se mantiene con axios directo,
     * ahora vía POST /api en vez de GET /cgi.
     *
     * @param {string} empresaId
     * @param {string} callId
     * @returns {Promise<Buffer>}
     */
    async getRecording(empresaId, callId) {
        await this._ensureSession(empresaId)

        const res = await axios.post(
        `${this.baseUrl}/api`,
        { request: { action: 'recapi', cookie: this.cookie, callid: callId } },
        { httpsAgent, responseType: 'arraybuffer' }
        )

        return Buffer.from(res.data)
    }

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