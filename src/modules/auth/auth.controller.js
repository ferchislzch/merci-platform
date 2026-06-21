const authService = require('./auth.service')

/**
 * GET /api/auth/empresas?q=texto
 * Autocomplete de empresas para el formulario de login.
 * Endpoint público — no requiere autenticación.
 * Devuelve máximo 10 resultados que contengan el texto buscado.
 */
const buscarEmpresas = async (req, res, next) => {
  try {
    const { q = '' } = req.query
    const empresas = await authService.buscarEmpresasLogin(q)
    res.json({ ok: true, mensaje: 'Empresas encontradas', data: { empresas } })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/login
 * Body: { usuario, password, empresaId? }
 * empresaId es opcional solo para el Super Admin.
 * Para usuarios normales, viene del autocomplete del formulario.
 */
const login = async (req, res, next) => {
  try {
    const { usuario, password, empresaId } = req.body

    if (!usuario || !password) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Usuario y contraseña son requeridos',
      })
    }

    const ip = req.ip
    const dispositivo = req.headers['user-agent'] || null

    const resultado = await authService.login({ usuario, password, empresaId }, ip, dispositivo)

    res.json({
      ok: true,
      mensaje: 'Login correcto',
      data: resultado,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * Devuelve un nuevo access token sin necesidad de volver a loguearse.
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Refresh token requerido',
      })
    }

    const resultado = await authService.refresh(refreshToken)

    res.json({
      ok: true,
      mensaje: 'Token renovado',
      data: resultado,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/logout
 * Body: { refreshToken }
 * Desactiva la sesión actual. El access token expira solo en 8h,
 * pero auth.middleware.js ya rechaza cualquier request si no hay
 * sesión activa — el efecto del logout es inmediato.
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    await authService.logout(refreshToken)
    res.json({ ok: true, mensaje: 'Sesión cerrada correctamente' })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/auth/me
 * Devuelve los datos del usuario autenticado actualmente.
 * Requiere authenticate — req.user ya viene cargado del JWT.
 * No hace query a la BD: usa lo que ya está en el token.
 * Si necesitan datos frescos (nombre, estado actual), hagamos
 * una versión que sí consulte BD — esto es suficiente para v1.
 */
const me = (req, res) => {
  res.json({
    ok: true,
    mensaje: 'Usuario autenticado',
    data: { usuario: req.user },
  })
}

module.exports = { buscarEmpresas, login, refresh, logout, me }