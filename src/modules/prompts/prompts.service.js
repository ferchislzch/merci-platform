const promptsRepository = require('./prompts.repository');
const agentesRepository = require('../agentes/agentes.repository'); // Reutilizamos tu filtro de seguridad

const crearVersionPrompt = async (agenteId, empresaId, usuarioId, datosPrompt) => {
    // 1. Validar que el agente existe y le pertenece a esta empresa
    const agente = await agentesRepository.obtenerPorId(agenteId, empresaId);
    if (!agente) {
        return null; // Bloqueo de seguridad si intentan meter mano a otra empresa
    }

    // 2. Obtener el número de versión actual y calcular el siguiente
    const ultimaVersion = await promptsRepository.obtenerUltimaVersion(agenteId);
    const proximaVersion = ultimaVersion + 1;

    // 3. Ejecutar la transacción de guardado
    return await promptsRepository.crearVersion(agenteId, usuarioId, datosPrompt, proximaVersion);
};

const obtenerVersionesPorAgente = async (agenteId, empresaId) => {
    // 1. Validar que el agente existe y pertenece a la empresa (reutilizando tu repo de agentes)
    const agente = await agentesRepository.obtenerPorId(agenteId, empresaId);
    if (!agente) {
        return null; // Si intentan ver prompts de otra empresa, los bloqueamos
    }

    // 2. Traer el historial
    return await promptsRepository.obtenerVersiones(agenteId);
};

const restaurarVersionPrompt = async (agenteId, empresaId, versionId) => {
    // 1. Validar que el agente existe y pertenece a la empresa del usuario
    const agente = await agentesRepository.obtenerPorId(agenteId, empresaId);
    if (!agente) {
        return null;
    }

    // 2. Proceder a restaurar en la base de datos
    return await promptsRepository.restaurarVersion(agenteId, versionId);
};

module.exports = {
    crearVersionPrompt,
    obtenerVersionesPorAgente,
    restaurarVersionPrompt
};