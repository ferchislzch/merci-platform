const prisma = require('../config/database')

/**
 * Registra una acción en auditoria_logs
 * Se llama desde los services de cada módulo después de
 * cualquier operación de escritura (INSERT, UPDATE, DELETE)
 *
 * @param {Object} params
 * @param {string} params.usuarioId - UUID del usuario que realizó la acción
 * @param {string} params.empresaId - UUID de la empresa
 * @param {string} params.ip - IP del request (req.ip)
 * @param {string} params.modulo - Nombre del módulo (ej: 'agentes', 'tickets')
 * @param {string} params.accion - 'INSERT' | 'UPDATE' | 'DELETE'
 * @param {string} params.tabla - Nombre de la tabla afectada
 * @param {string} params.registroId - UUID del registro afectado
 * @param {Object} params.datosAntes - Estado anterior (solo en UPDATE/DELETE)
 * @param {Object} params.datosNuevos - Estado nuevo (solo en INSERT/UPDATE)
 */
const log = async ({
    usuarioId,
    empresaId,
    ip,
    modulo,
    accion,
    tabla,
    registroId,
    datosAntes = null,
    datosNuevos = null,
    }) => {
    try {
        await prisma.auditoria_logs.create({
        data: {
            empresa_id: empresaId,
            usuario_id: usuarioId || null,
            ip: ip || null,
            modulo: modulo || null,
            accion,
            tabla_afectada: tabla || null,
            registro_id: registroId || null,
            datos_anteriores: datosAntes || undefined,
            datos_nuevos: datosNuevos || undefined,
        },
        })
    } catch (err) {
        // La auditoría NUNCA debe romper el flujo principal
        // Si falla, solo loggeamos en consola
        console.error('[audit.service] Error al registrar auditoría:', err.message)
    }
}

module.exports = { log }