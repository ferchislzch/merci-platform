'use strict'

const authService = require('./auth.service')

// GET /api/auth/empresas — ELIMINADO. Era el autocomplete público.
// Reemplazado por validación directa de codigoAcceso en el login.

/**
 * POST /api/auth/login
 * Body: { usuario, password, codigoAcceso }
 * codigoAcceso: código único de empresa — reemplaza empresaId del autocomplete.
 * Sin codigoAcceso solo funciona el Super Admin (API directa, no frontend).
 */
const login = async (req, res, next) => {
  try {
    const { usuario, password, codigoAcceso } = req.body

    if (!usuario || !password) {
      return res.status(400).json({
        ok:      false,
        mensaje: 'Usuario y contraseña son requeridos.',
      })
    }

    const ip          = req.ip
    const dispositivo = req.headers['user-agent'] || null

    const resultado = await authService.login(
      { usuario, password, codigoAcceso },
      ip,
      dispositivo
    )

    res.json({
      ok:      true,
      mensaje: 'Login correcto.',
      data:    resultado,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({
        ok:      false,
        mensaje: 'Refresh token requerido.',
      })
    }

    const resultado = await authService.refresh(refreshToken)

    res.json({
      ok:      true,
      mensaje: 'Token renovado.',
      data:    resultado,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/logout
 * Body: { refreshToken }
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    await authService.logout(refreshToken)
    res.json({ ok: true, mensaje: 'Sesión cerrada correctamente.' })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/auth/me
 * Sin query a BD — usa req.user del JWT ya validado por auth.middleware.
 */
const me = (req, res) => {
  res.json({
    ok:      true,
    mensaje: 'Usuario autenticado.',
    data:    { usuario: req.user },
  })
}

module.exports = { login, refresh, logout, me }