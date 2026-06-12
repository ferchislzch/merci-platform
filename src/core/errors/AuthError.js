const AppError = require('./AppError')

// 401 → no autenticado (sin token o token inválido)
class UnauthorizedError extends AppError {
    constructor(message = 'No autenticado') {
        super(message, 401)
    }
}

// 403 → autenticado pero sin permiso para esta acción
class ForbiddenError extends AppError {
    constructor(message = 'No tienes permiso para realizar esta acción') {
        super(message, 403)
    }
}

module.exports = { UnauthorizedError, ForbiddenError }