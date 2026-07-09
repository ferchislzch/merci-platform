const agentesRepository = require('./agentes.repository');

const obtenerAgentes = async (empresaId) => {
    // El servicio le pide los datos al repositorio
    return await agentesRepository.obtenerTodos(empresaId);
};

const crearAgente = async (empresaId, datosAgente) => {
    // Aquí después podríamos agregar validaciones extra si se ocupan
    return await agentesRepository.crearAgente(empresaId, datosAgente);
};

const obtenerAgentePorId = async (id, empresaId) => {
    return await agentesRepository.obtenerPorId(id, empresaId);
};

const actualizarAgente = async (id, empresaId, datosActualizados) => {
    // 1. Validar si el agente existe y pertenece a la empresa
    const agenteExistente = await agentesRepository.obtenerPorId(id, empresaId);
    
    if (!agenteExistente) {
        return null; // Detener el proceso si no pasa el filtro de seguridad
    }

    // 2. Si todo está correcto, proceder a actualizar
    return await agentesRepository.actualizar(id, datosActualizados);
};

const cambiarEstadoAgente = async (id, empresaId, estadoId) => {
    // 1. Validar si el agente existe y pertenece a la empresa
    const agenteExistente = await agentesRepository.obtenerPorId(id, empresaId);
    
    if (!agenteExistente) {
        return null;
    }

    // 2. Proceder a cambiar el estado enviando el ID del catálogo
    return await agentesRepository.cambiarEstado(id, estadoId);
};

const eliminarAgente = async (id, empresaId) => {
    // 1. Validar si el agente existe y pertenece a la empresa del Token
    const agenteExistente = await agentesRepository.obtenerPorId(id, empresaId);
    
    if (!agenteExistente) {
        return null; // Detiene el proceso si no pasa el filtro de seguridad
    }

    // 2. Si todo es correcto, ejecuta el borrado lógico en el repositorio
    return await agentesRepository.eliminarLogico(id);
};

module.exports = {
    obtenerAgentes,
    crearAgente,
    obtenerAgentePorId,
    actualizarAgente,
    cambiarEstadoAgente,
    eliminarAgente
};  