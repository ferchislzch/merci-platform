const promptsRepository = require('./prompts.repository');
const agentesRepository = require('../agentes/agentes.repository');

const crearVersionPrompt = async (agenteId, empresaId, usuarioId, datosPrompt) => {
    // 1. Validar Anti-IDOR: El agente debe existir y pertenecer a la empresa
    const agente = await agentesRepository.obtenerPorId(agenteId, empresaId);
    if (!agente) {
        return null;
    }

    // 2. Obtener la última versión y calcular la siguiente
    const ultimaVersion = await promptsRepository.obtenerUltimaVersion(agenteId);
    const proximaVersion = (ultimaVersion || 0) + 1;

    // 3. Crear versión en transacción
    const nuevaVersion = await promptsRepository.crearVersion(agenteId, usuarioId, datosPrompt, proximaVersion);

    // 4. Log de Auditoría
    console.log(`[AUDITORIA] Nueva versión de Prompt (V${proximaVersion}) creada para Agente: ${agenteId} por Usuario: ${usuarioId}`);

    return nuevaVersion;
};

const obtenerVersionesPorAgente = async (agenteId, empresaId) => {
    // 1. Validar Anti-IDOR
    const agente = await agentesRepository.obtenerPorId(agenteId, empresaId);
    if (!agente) {
        return null;
    }

    // 2. Traer el historial de prompts
    return await promptsRepository.obtenerVersiones(agenteId);
};

const restaurarVersionPrompt = async (agenteId, empresaId, versionId, usuarioId) => {
    // 1. Validar Anti-IDOR
    const agente = await agentesRepository.obtenerPorId(agenteId, empresaId);
    if (!agente) {
        return null;
    }

    // 2. Restaurar versión en base de datos
    const versionRestaurada = await promptsRepository.restaurarVersion(agenteId, versionId);

    // 3. Log de Auditoría
    if (versionRestaurada) {
        console.log(`[AUDITORIA] Prompt restaurado a versión V${versionRestaurada.version} en Agente: ${agenteId} por Usuario: ${usuarioId || 'Desconocido'}`);
    }

    return versionRestaurada;
};

module.exports = {
    crearVersionPrompt,
    obtenerVersionesPorAgente,
    restaurarVersionPrompt
};