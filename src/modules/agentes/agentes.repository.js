const prisma = require('../../config/database');

const obtenerTodos = async (empresaId) => {
    return await prisma.agentes_virtuales.findMany({
        where: {
            empresa_id: empresaId,
            deleted_at: null
        }
    });
};

const crearAgente = async (empresaId, datosAgente) => {
    return await prisma.agentes_virtuales.create({
        data: {
            ...datosAgente, // Aquí vienen el nombre, rol, etc.
            empresa_id: empresaId // Forzamos el ID de la empresa por seguridad
        }
    });
};

const obtenerPorId = async (id, empresaId) => {
    return await prisma.agentes_virtuales.findFirst({
        where: {
            id: id,
            empresa_id: empresaId,
            deleted_at: null
        }
    });
};

const actualizar = async (id, datosActualizados) => {
    return await prisma.agentes_virtuales.update({
        where: {
            id: id
        },
        data: datosActualizados
    });
};

const cambiarEstado = async (id, estadoId) => {
    return await prisma.agentes_virtuales.update({
        where: {
            id: id
        },
        data: {
            catalogo_estado_agente: {
                connect: { id: estadoId }
            }
        }
    });
};

const eliminarLogico = async (id) => {
    return await prisma.agentes_virtuales.update({
        where: {
            id: id
        },
        data: {
            deleted_at: new Date() // Setea la fecha y hora exacta del borrado
        }
    });
};

module.exports = {
    obtenerTodos,
    crearAgente,
    obtenerPorId,
    actualizar,
    cambiarEstado,
    eliminarLogico
};