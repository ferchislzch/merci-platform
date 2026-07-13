const AppError = require('./AppError')

// 404 → el recurso solicitado no existe (o fue soft-deleted)
// Uso: throw new NotFoundError('Usuario')  →  "Usuario no encontrado"
class NotFoundError extends AppError {
  constructor(recurso = 'Recurso') {
    super(`${recurso} no encontrado`, 404)
  }
}

module.exports = { NotFoundError }