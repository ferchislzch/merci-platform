const agentesService = require('./agentes.service');

const obtenerAgentes = async (req, res, next) => {
    try {
        // Extraemos el ID de la empresa directamente de req (nunca de req.user.empresaId) 
        const empresaId = req.empresaId;
        
        // Llamamos al service
        const agentes = await agentesService.obtenerAgentes(empresaId);
        
        // Respondemos con el formato estándar obligatorio [cite: 694-699]
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

        // 👇 EXPRESIÓN REGULAR PARA VALIDAR SI EL ID ES UN UUID VÁLIDO
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (!uuidRegex.test(id)) {
            // Si no cumple el formato UUID, respondemos inmediatamente con 404
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        // Si el formato es correcto, procedemos con la búsqueda en la base de datos
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
        // 1. Ponemos estos console.log para ver dónde está escondido el ID
        console.log("Datos en req.user:", req.user);
        console.log("Datos en req.empresaId:", req.empresaId);

        // 2. Intentamos sacarlo de los lugares más comunes
        const empresaId = req.empresaId || req.user?.empresa_id || req.user?.empresaId || req.usuario?.empresa_id;

        // 3. Validamos que ahora sí exista
        if (!empresaId) {
            return res.status(400).json({ 
                ok: false, 
                mensaje: "Error de desarrollo: No se encontró el ID de la empresa en el token" 
            });
        }

        const datosAgente = req.body;    
        const nuevoAgente = await agentesService.crearAgente(empresaId, datosAgente);

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
        const datosActualizados = req.body; // Captura los datos que el usuario quiere cambiar

        // Expresión regular para validar el formato del UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (!uuidRegex.test(id)) {
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        const agenteActualizado = await agentesService.actualizarAgente(id, empresaId, datosActualizados);

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
        const { estadoId } = req.body; // 👇 Ahora esperamos el ID del estado del catálogo

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        // Validamos el ID del agente
        if (!uuidRegex.test(id)) {
            return res.status(404).json({ ok: false, mensaje: "Agente no encontrado" });
        }

        // 👇 Validamos que el estadoId recibido también tenga formato UUID válido
        if (!estadoId || !uuidRegex.test(estadoId)) {
            return res.status(400).json({ 
                ok: false, 
                mensaje: "El campo estadoId es requerido y debe ser un UUID válido" 
            });
        }

        const agenteActualizado = await agentesService.cambiarEstadoAgente(id, empresaId, estadoId);
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
        const { id } = req.params;       // Extrae el :id de la URL
        const empresaId = req.empresaId;  // El ID de la empresa inyectado por el middleware de autenticación

        // Expresión regular para validar el formato del UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (!uuidRegex.test(id)) {
            // Si el ID tiene letras de más, de menos o caracteres inválidos, responde 404 de inmediato
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        // Llama al servicio enviando el ID y el ID de la empresa
        const agenteEliminado = await agentesService.eliminarAgente(id, empresaId);

        if (!agenteEliminado) {
            // Si el servicio devolvió null (no existía o era de otra empresa)
            return res.status(404).json({
                ok: false,
                mensaje: "Agente no encontrado"
            });
        }

        // Respuesta exitosa
        res.status(200).json({
            ok: true,
            mensaje: "Agente eliminado exitosamente"
        });
    } catch (error) {
        next(error); // Pasa cualquier error inesperado al manejador global
    }
};

// Exportamos todas las funciones
module.exports = {
    obtenerAgentes,
    obtenerAgentePorId,
    crearAgente,
    actualizarAgente,
    cambiarEstadoAgente,
    eliminarAgente
};