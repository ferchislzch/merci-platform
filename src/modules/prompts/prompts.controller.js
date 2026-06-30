const promptsService = require('./prompts.service');

// 1. Crear versión (La que ya programamos)
const crearVersionPrompt = async (req, res, next) => {
    try {
        const { id: agenteId } = req.params;
        
        const empresaId = req.user?.empresaId;
        const usuarioId = req.user?.usuarioId; 

        // 👇 ¡ESTA ES LA LÍNEA QUE FALTABA! Extraer los datos que mandas desde Apidog
        const { prompt, descripcion_cambio } = req.body;

        // Validación de seguridad
        if (!usuarioId || !empresaId) {
            return res.status(401).json({ 
                ok: false, 
                mensaje: "No se pudo identificar las credenciales del usuario autenticado en la sesión." 
            });
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(agenteId)) {
            return res.status(404).json({ ok: false, mensaje: "Agente no encontrado" });
        }

        // Ahora sí, esta validación funcionará perfecto
        if (!prompt || prompt.trim() === '') {
            return res.status(400).json({ ok: false, mensaje: "El campo 'prompt' es requerido" });
        }

        const nuevaVersion = await promptsService.crearVersionPrompt(agenteId, empresaId, usuarioId, { prompt, descripcion_cambio });

        if (!nuevaVersion) {
            return res.status(404).json({ ok: false, mensaje: "Agente no encontrado" });
        }

        res.status(201).json({
            ok: true,
            mensaje: `Versión V${nuevaVersion.version} del prompt creada y activada correctamente`,
            data: nuevaVersion
        });
    } catch (error) {
        next(error);
    }
};

// 2. 👇 Marcador para Obtener Historial (Evita el error en línea 11 de rutas)
const obtenerVersionesPorAgente = async (req, res, next) => {
    try {
        const { id: agenteId } = req.params;
        const empresaId = req.user?.empresaId;

        // Validar seguridad de sesión
        if (!empresaId) {
            return res.status(401).json({ ok: false, mensaje: "Credenciales de empresa no encontradas." });
        }

        // Validar UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(agenteId)) {
            return res.status(404).json({ ok: false, mensaje: "Agente no encontrado" });
        }

        // Llamar al servicio
        const historial = await promptsService.obtenerVersionesPorAgente(agenteId, empresaId);

        if (!historial) {
            return res.status(404).json({ ok: false, mensaje: "Agente no encontrado o sin acceso" });
        }

        res.status(200).json({
            ok: true,
            data: historial
        });
    } catch (error) {
        next(error);
    }
};

const restaurarVersionPrompt = async (req, res, next) => {
    try {
        const { id: agenteId } = req.params;
        const { versionId } = req.body; // 👈 Pediremos el UUID de la versión en el Body
        const empresaId = req.user?.empresaId;

        // Validaciones de seguridad
        if (!empresaId) {
            return res.status(401).json({ ok: false, mensaje: "Credenciales de empresa no encontradas." });
        }

        if (!versionId) {
            return res.status(400).json({ ok: false, mensaje: "El ID de la versión (versionId) es requerido." });
        }

        // Llamamos al servicio
        const versionRestaurada = await promptsService.restaurarVersionPrompt(agenteId, empresaId, versionId);

        if (!versionRestaurada) {
            return res.status(404).json({ ok: false, mensaje: "No se pudo restaurar la versión. Verifica los datos." });
        }

        res.status(200).json({
            ok: true,
            mensaje: `Versión V${versionRestaurada.version} restaurada y activada correctamente`,
            data: versionRestaurada
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    crearVersionPrompt,
    obtenerVersionesPorAgente, 
    restaurarVersionPrompt     
};