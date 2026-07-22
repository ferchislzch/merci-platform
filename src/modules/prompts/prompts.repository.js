const prisma = require('../../config/database');

// 1. Buscar el número de versión más alto que tiene el agente actualmente
const obtenerUltimaVersion = async (agenteId) => {
    const ultimoPrompt = await prisma.versiones_prompt.findFirst({
        where: { agente_virtual_id: agenteId },
        orderBy: { version: 'desc' },
        select: { version: true }
    });
    // Si no tiene prompts previos devuelve 0, de lo contrario devuelve el número de versión
    return ultimoPrompt ? ultimoPrompt.version : 0;
};

// 2. Transacción: Desactivar el actual y crear la nueva versión
const crearVersion = async (agenteId, usuarioId, datosPrompt, proximaVersion) => {
    // Ya no usamos $transaction ni updateMany, la BD hace la desactivación sola.
    return await prisma.versiones_prompt.create({
        data: {
            // Asignación directa de los campos escalares (SIN 'connect')
            agente_virtual_id: agenteId, 
            usuario_id: usuarioId,       
            version: proximaVersion,
            prompt: datosPrompt.prompt,
            descripcion_cambio: datosPrompt.descripcion_cambio || null,
            es_activa: true
        }
    });
};
const obtenerVersiones = async (agenteId) => {
    return await prisma.versiones_prompt.findMany({
        where: { 
            agente_virtual_id: agenteId 
        },
        orderBy: { 
            version: 'desc' // La versión más nueva (o activa) saldrá primero
        },
        // Opcional pero muy útil: Traer el ID del usuario que hizo el cambio
        select: {
            id: true,
            version: true,
            prompt: true,
            descripcion_cambio: true,
            es_activa: true,
            fecha_registro: true,
            usuario_id: true 
        }
    });
};

const restaurarVersion = async (agenteId, versionId) => {
    return await prisma.$transaction(async (tx) => {
        // 1. Apagar la versión que esté activa actualmente
        await tx.versiones_prompt.updateMany({
            where: {
                agente_virtual_id: agenteId,
                es_activa: true
            },
            data: {
                es_activa: false
            }
        });

        // 2. Encender la versión que queremos restaurar
        return await tx.versiones_prompt.update({
            where: {
                id: versionId // El UUID de la versión específica
            },
            data: {
                es_activa: true
            }
        });
    });
};

module.exports = {
    obtenerUltimaVersion,
    crearVersion,
    obtenerVersiones,
    restaurarVersion
};