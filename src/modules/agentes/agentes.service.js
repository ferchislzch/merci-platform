const agentesRepository = require('./agentes.repository');

const obtenerAgentes = async (empresaId) => {
    return await agentesRepository.obtenerTodos(empresaId);
};

const obtenerAgentePorId = async (id, empresaId) => {
    return await agentesRepository.obtenerPorId(id, empresaId);
};

const crearAgente = async (empresaId, datos, usuarioId) => {
    const nuevoAgente = await agentesRepository.crear({
        ...datos,
        empresa_id: empresaId
    });

    console.log(`[AUDITORIA] Agente creado: ${nuevoAgente.id} por Usuario: ${usuarioId || 'Desconocido'} en Empresa: ${empresaId}`);
    return nuevoAgente;
};

const actualizarAgente = async (id, empresaId, datos, usuarioId) => {
    // 1. Validar existencia y pertenecencia a la empresa (Protección Anti-IDOR)
    const agenteExistente = await agentesRepository.obtenerPorId(id, empresaId);
    if (!agenteExistente) {
        return null;
    }

    // 2. Actualizar registros en BD
    const agenteActualizado = await agentesRepository.actualizar(id, datos);

    console.log(`[AUDITORIA] Agente actualizado: ${id} por Usuario: ${usuarioId || 'Desconocido'} en Empresa: ${empresaId}`);
    return agenteActualizado;
};

const cambiarEstadoAgente = async (id, empresaId, estadoId, usuarioId) => {
    // 1. Validar existencia y pertenecencia a la empresa
    const agenteExistente = await agentesRepository.obtenerPorId(id, empresaId);
    if (!agenteExistente) {
        return null;
    }

    // 2. Actualizar solo el estado
    const agenteActualizado = await agentesRepository.actualizar(id, {
        estado_agente_id: estadoId
    });

    console.log(`[AUDITORIA] Estado de Agente ${id} cambiado a ${estadoId} por Usuario: ${usuarioId || 'Desconocido'}`);
    return agenteActualizado;
};

const eliminarAgente = async (id, empresaId, usuarioId) => {
    // 1. Validar existencia y pertenecencia a la empresa
    const agenteExistente = await agentesRepository.obtenerPorId(id, empresaId);
    if (!agenteExistente) {
        return null;
    }

    // 2. Borrado lógico (soft delete)
    const agenteEliminado = await agentesRepository.eliminarLogico(id);

    console.log(`[AUDITORIA] Agente eliminado lógicamente: ${id} por Usuario: ${usuarioId || 'Desconocido'}`);
    return agenteEliminado;
};

module.exports = {
    obtenerAgentes,
    obtenerAgentePorId,
    crearAgente,
    actualizarAgente,
    cambiarEstadoAgente,
    eliminarAgente
};