const AppError = require('../errors/AppError')

// Handler global — debe registrarse ÚLTIMO en app.js
// Atrapa cualquier error que llegue via next(error)
const errorHandler = (err, req, res, next) => {
    // Si es un error operacional conocido, mostrar el mensaje
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
        ok: false,
        mensaje: err.message,
        })
    }

    // Error de Prisma: registro no encontrado
    if (err.code === 'P2025') {
        return res.status(404).json({
        ok: false,
        mensaje: 'Registro no encontrado',
        })
    }

    // Error de Prisma: violación de constraint único
    if (err.code === 'P2002') {
        return res.status(409).json({
        ok: false,
        mensaje: 'Ya existe un registro con esos datos',
        })
    }

    // Error inesperado — no exponemos detalles al cliente
    if (process.env.NODE_ENV === 'development') {
        console.error('ERROR NO CONTROLADO:', err)
        return res.status(500).json({
        ok: false,
        mensaje: err.message,
        stack: err.stack,
        })
    }

    console.error('ERROR NO CONTROLADO:', err)
    return res.status(500).json({
        ok: false,
        mensaje: 'Error interno del servidor',
    })
}

module.exports = errorHandler