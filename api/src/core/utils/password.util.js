const bcrypt = require('bcrypt')

const SALT_ROUNDS = 10

/**
 * Hashea una contraseña en texto plano para guardarla en usuarios.password_hash
 */
const hashPassword = async (passwordPlano) => {
  return bcrypt.hash(passwordPlano, SALT_ROUNDS)
}

/**
 * Compara una contraseña en texto plano contra el hash guardado en BD
 */
const comparePassword = async (passwordPlano, hash) => {
  return bcrypt.compare(passwordPlano, hash)
}

module.exports = { hashPassword, comparePassword }