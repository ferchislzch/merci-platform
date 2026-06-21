const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const env = require('../../config/env')

/**
 * Genera el access token (JWT corto, stateless).
 * El payload debe seguir exactamente este contrato — auth.middleware.js,
 * tenant.middleware.js y permission.middleware.js ya asumen esta forma:
 *   { usuarioId, empresaId, roles, permisos, esGlobal }
 */
const generarAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN })
}

/**
 * Genera el refresh token (JWT largo, firmado con secret distinto).
 * Solo lleva usuarioId — no necesita roles/permisos porque su único
 * propósito es pedir un access token nuevo, no autorizar nada por sí mismo.
 */
const generarRefreshToken = (usuarioId) => {
  return jwt.sign({ usuarioId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  })
}

const verificarRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET)
}

/**
 * sesiones.token_hash guarda el hash del REFRESH token, no del access token.
 * Razón: el access token ya es stateless (su propia firma JWT lo valida en
 * cada request, ver auth.middleware.js) y expira solo en 8h sin necesidad
 * de revocación individual. El refresh token, en cambio, vive 7 días y sí
 * necesita poder revocarse (logout, "una sola sesión activa") comparándolo
 * contra un valor persistido — para eso sirve este hash.
 *
 * Se usa SHA-256 simple (no bcrypt): el refresh token ya es un JWT firmado
 * y aleatorio de alta entropía, no una contraseña elegida por un humano,
 * así que no necesita salt ni cómputo lento — solo necesitamos poder
 * comparar "este token que llegó" contra "el que guardamos" sin guardarlo
 * en texto plano.
 */
const hashRefreshToken = (refreshToken) => {
  return crypto.createHash('sha256').update(refreshToken).digest('hex')
}

module.exports = {
  generarAccessToken,
  generarRefreshToken,
  verificarRefreshToken,
  hashRefreshToken,
}