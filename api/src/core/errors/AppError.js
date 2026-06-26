// Clase base para todos los errores del sistema
// isOperational = true → error esperado (validación, not found, auth)
// isOperational = false → error inesperado (bug, falla de BD)
// El error handler global usa esta distinción para decidir
// si mostrar el mensaje al cliente o solo loggear

class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message)
        this.statusCode = statusCode
        this.isOperational = isOperational
        this.name = this.constructor.name
        Error.captureStackTrace(this, this.constructor)
    }
}

module.exports = AppError