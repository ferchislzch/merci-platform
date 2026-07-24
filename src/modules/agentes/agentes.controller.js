const agentesService = require('./agentes.service');

// Helper interno para limpiar objetos y dejar solo campos presentes en el req.body
const filtrarCampos = (body) => {
    const camposPermitidos = [
        'nombre',
        'descripcion',
        'numero_entrada',
        'numeroEntrada',
        'tipo_agente_id',
        'tipoAgenteId',
        'estado_agente_id',
        'estadoAgenteId',
        'sucursal_id',
        'sucursalId',
        'departamento_id',
        'departamentoId',
        'calendario_id',
        'calendarioId'
    ];

    const datosLimpios = {};

    // Mapeo unificado a los nombres exactos de la base de datos (snake_case)
    if (body.nombre !== undefined) datosLimpios.nombre = body.nombre;
    if (body.descripcion !== undefined) datosLimpios.descripcion = body.descripcion;
    
    if (body.numero_entrada !== undefined || body.numeroEntrada !== undefined) {
        datosLimpios.numero_entrada = body.numero_entrada ?? body.numeroEntrada;
    }
    if (body.tipo_agente_id !== undefined || body.tipoAgenteId !== undefined) {
        datosLimpios.tipo_agente_id = body.tipo_agente_id ?? body.tipoAgenteId;
    }
    if (body.estado_agente_id !== undefined || body.estadoAgenteId !== undefined) {
        datosLimpios.estado_agente_id = body.estado_agente_id ?? body.estadoAgenteId;
    }
    if (body.sucursal_id !== undefined || body.sucursalId !== undefined) {
        datosLimpios.sucursal_id = body.sucursal_id ?? body.sucursalId;
    }
    if (body.departamento_id !== undefined || body.departamentoId !== undefined) {
        datosLimpios.departamento_id = body.departamento_id ?? body.departamentoId;
    }
    if (body.calendario_id !== undefined || body.calendarioId !== undefined) {
        datosLimpios.calendario_id = body.calendario_id ?? body.calendarioId;
    }

    return datosLimpios;
};

const obtenerAgentes = async (req, res, next) => {
    try {
        const empresaId = req.empresaId;
        const agentes = await agentesService.obtenerAgentes(empresaId);
        
        res.json({ 
            ok: true, 
            mensaje: "Lista de agentes obtenida", 
            data: agentes 
        });
    } catch (error) {
        next(error); 
    }
};

const obtenerAgentePorId = async (req, res, next) => {
    try {
        const { id } = req.params;      
        const empresaId = req.empresaId; 

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (!uuidRegex.test(id)) {
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        const agente = await agentesService.obtenerAgentePorId(id, empresaId);

        if (!agente) {
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Agente obtenido exitosamente",
            data: agente
        });
    } catch (error) {
        next(error);
    }
};

const crearAgente = async (req, res, next) => {
    try {
        const empresaId = req.empresaId || req.user?.empresa_id || req.user?.empresaId || req.usuario?.empresa_id;

        if (!empresaId) {
            return res.status(400).json({ 
                ok: false, 
                mensaje: "Error de desarrollo: No se encontró el ID de la empresa en el token" 
            });
        }

        // 🛑 WHITELIST: Extraer y limpiar datos
        const datosLimpios = filtrarCampos(req.body);

        const usuarioId = req.user?.id || req.usuario?.id; // Para auditoría
        const nuevoAgente = await agentesService.crearAgente(empresaId, datosLimpios, usuarioId);

        res.status(201).json({
            ok: true,
            mensaje: "Agente creado exitosamente",
            data: nuevoAgente
        });
    } catch (error) {
        next(error); 
    }
};

const actualizarAgente = async (req, res, next) => {
    try {
        const { id } = req.params;
        const empresaId = req.empresaId;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (!uuidRegex.test(id)) {
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        // 🛑 WHITELIST: Filtrar solo campos definidos
        const datosActualizados = filtrarCampos(req.body);

        // Si no viene ningún campo válido en el body
        if (Object.keys(datosActualizados).length === 0) {
            return res.status(400).json({
                ok: false,
                mensaje: "No se enviaron campos válidos para actualizar"
            });
        }

        const usuarioId = req.user?.id || req.usuario?.id; // Para auditoría
        const agenteActualizado = await agentesService.actualizarAgente(id, empresaId, datosActualizados, usuarioId);

        if (!agenteActualizado) {
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Agente actualizado exitosamente",
            data: agenteActualizado
        });
    } catch (error) {
        next(error);
    }
};

const cambiarEstadoAgente = async (req, res, next) => {
    try {
        const { id } = req.params;
        const empresaId = req.empresaId;
        const { estadoId, estado_agente_id } = req.body;
        
        const nuevoEstadoId = estadoId || estado_agente_id;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (!uuidRegex.test(id)) {
            return res.status(404).json({ ok: false, mensaje: "Agente no encontrado" });
        }

        if (!nuevoEstadoId || !uuidRegex.test(nuevoEstadoId)) {
            return res.status(400).json({ 
                ok: false, 
                mensaje: "El campo estadoId es requerido y debe ser un UUID válido" 
            });
        }

        const usuarioId = req.user?.id || req.usuario?.id; // Para auditoría
        const agenteActualizado = await agentesService.cambiarEstadoAgente(id, empresaId, nuevoEstadoId, usuarioId);
        
        if (!agenteActualizado) {
            return res.status(404).json({ ok: false, mensaje: "Agente no encontrado" });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Estado del agente actualizado exitosamente",
            data: agenteActualizado
        });
    } catch (error) {
        next(error);
    }
};

const eliminarAgente = async (req, res, next) => {
    try {
        const { id } = req.params;
        const empresaId = req.empresaId;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (!uuidRegex.test(id)) {
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        const usuarioId = req.user?.id || req.usuario?.id; // Para auditoría
        const agenteEliminado = await agentesService.eliminarAgente(id, empresaId, usuarioId);

        if (!agenteEliminado) {
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Agente eliminado exitosamente"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    obtenerAgentes,
    obtenerAgentePorId,
    crearAgente,
    actualizarAgente,
    cambiarEstadoAgente,
    eliminarAgente
};