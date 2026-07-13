const jwt = require('jsonwebtoken')
const env = require('../../config/env')
const { UnauthorizedError } = require('../errors/AuthError')
const prisma = require('../../config/database')

// Verifica el JWT y carga el usuario en req.user
// Todos los módulos protegidos usan este middleware
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Token no proporcionado')
        }

        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, env.JWT_SECRET)

        // Verificar que la sesión sigue activa en BD
        // (el trigger tr_desactivar_sesiones_anteriores puede haberla cerrado)
        const sesion = await prisma.sesiones.findFirst({
        where: {
            usuario_id: decoded.usuarioId,
            activo: true,
        },
        })

        if (!sesion) {
        throw new UnauthorizedError('Sesión expirada o inválida')
        }

        // Adjuntar datos del usuario al request
        // Disponibles en todos los controllers como req.user
        req.user = {
        usuarioId: decoded.usuarioId,
        empresaId: decoded.empresaId,
        sucursalId: decoded.sucursalId || null,
        roles: decoded.roles || [],
        permisos: decoded.permisos || [],
        esGlobal: decoded.esGlobal || false,
        }

        next()
    } catch (err) {
        if (err.name === 'JsonWebTokenError') {
        return next(new UnauthorizedError('Token inválido'))
        }
        if (err.name === 'TokenExpiredError') {
        return next(new UnauthorizedError('Token expirado'))
        }
        next(err)
    }
}

module.exports = authenticate