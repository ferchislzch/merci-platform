const prisma = require('../../config/database');

const obtenerTodos = async (empresaId) => {
    return await prisma.agentes_virtuales.findMany({
        where: {
            empresa_id: empresaId,
            deleted_at: null
        }
    });
};

const crear = async (datosAgente) => {
    return await prisma.agentes_virtuales.create({
        data: datosAgente
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
            estado_agente_id: estadoId
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
    crear,
    obtenerPorId,
    actualizar,
    cambiarEstado,
    eliminarLogico
};