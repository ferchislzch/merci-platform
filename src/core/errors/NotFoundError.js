const AppError = require('./AppError')

// 404 → el recurso solicitado no existe (o fue soft-deleted)
// Uso: throw new NotFoundError('Usuario')  →  "Usuario no encontrado"
class NotFoundError extends AppError {
  constructor(recurso = 'Recurso') {
    super(`${recurso} no encontrado`, 404)
  }
}

// Export dual: soporta tanto `const NotFoundError = require(...)` (default)
// como `const { NotFoundError } = require(...)` (nombrado).
module.exports = NotFoundError
module.exports.NotFoundError = NotFoundError