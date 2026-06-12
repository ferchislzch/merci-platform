const AppError = require('./AppError')

class NotFoundError extends AppError {
    constructor(resource = 'Recurso') {
        super(`${resource} no encontrado`, 404)
    }
}

module.exports = NotFoundError