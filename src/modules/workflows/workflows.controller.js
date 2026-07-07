
const workflowsService = require('./workflows.service');
const prisma = require('../../config/database');

const workflowsController = {
  /**
   * 1. Listar todos los workflows de la empresa
   */
  async listarWorkflows(req, res, next) {
    try {
      // 👑 Aplicamos tu Regla de Oro consistente: extraer la empresa del token (req.user)
      const empresaId = req.user?.empresa_id || req.user?.empresaId;

      if (!empresaId) {
        return res.status(400).json({ 
          ok: false,
          mensaje: "El token no contiene un ID de empresa válido." 
        });
      }

      // Pasamos el empresaId y enviamos los query params (page, limit) para la paginación
      const resultado = await workflowsService.listarWorkflows(empresaId, req.query);

      return res.status(200).json({
        ok: true,
        mensaje: "Workflows obtenidos correctamente",
        ...resultado // Esto esparcirá: total, paginas, pagina_actual, limite y data
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 2. Obtener un workflow por ID con sus versiones y reglas
   */
  async obtenerWorkflowPorId(req, res, next) {
    try {
      const { id } = req.params; // Saca el ID de la URL
      
      // 👇 La regla de oro: extraer la empresa del token (req.user)
      const empresaId = req.user?.empresa_id || req.user?.empresaId;

      if (!empresaId) {
        return res.status(400).json({ mensaje: "El token no contiene un ID de empresa válido." });
      }

      const workflow = await workflowsService.obtenerWorkflowPorId(id, empresaId);

      return res.status(200).json({
        ok: true,
        mensaje: "Workflow obtenido correctamente",
        data: workflow
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 3. Crear un nuevo workflow (Base + v1)
   */
  crearWorkflow: async (req, res) => {
        try {
            const { nombre, descripcion } = req.body;
            
            // 🕵️ LÍNEA DETECTIVE: Esto imprimirá en la consola qué trae tu token
            console.log("📌 DATOS DEL TOKEN (req.user):", req.user);
            
            // Vamos a intentar leerlo de ambas formas comunes (snake_case o camelCase)
            const empresaId = req.user.empresa_id || req.user.empresaId;
            // 👇 EXTRAEMOS EL USUARIO DEL TOKEN
            const usuarioId = req.user.usuario_id || req.user.usuarioId;

            // Validación de seguridad para que no intente guardar si sigue indefinido
            if (!empresaId) {
                return res.status(400).json({ mensaje: "El token no contiene un ID de empresa válido." });
            }

            const resultado = await workflowsService.crear({ 
                nombre, 
                descripcion, 
                empresaId,
                usuarioId
            });

            res.status(201).json({
                mensaje: "Workflow creado exitosamente",
                data: resultado
            });
        } catch (error) {
            console.error("Error en controlador al crear workflow:", error);
            res.status(500).json({ mensaje: error.message });
        }
    },

  /**
   * 4. Crear una nueva versión para un workflow existente
   */
  async crearVersionWorkflow(req, res, next) {
    try {
      const { id } = req.params; // ID del workflow
      const { empresaId } = req;
      const { descripcion, reglas } = req.body; // Puede o no recibir una lista de reglas iniciales

      const nuevaVersion = await workflowsService.crearVersionWorkflow(id, { descripcion, reglas, empresaId });

      return res.status(201).json({
        ok: true,
        mensaje: "Nueva versión creada y activada correctamente",
        data: nuevaVersion
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 5. Clonar un workflow completo
   */
  async clonarWorkflow(req, res, next) {
    try {
      const { id } = req.params; // ID del workflow a clonar
      const { empresaId } = req;

      const workflowClonado = await workflowsService.clonarWorkflow(id, empresaId);

      return res.status(201).json({
        ok: true,
        mensaje: "Workflow clonado exitosamente con su última configuración",
        data: workflowClonado
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 6. Cambiar la versión activa de un workflow
   */
  async activarVersion(req, res, next) {
    try {
      const { id, versionId } = req.params;
      const { empresaId } = req;

      await workflowsService.activarVersion(id, versionId, empresaId);

      return res.status(200).json({
        ok: true,
        mensaje: "Versión activada correctamente",
        data: null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 7. Eliminar un workflow (Soft Delete)
   */
  async eliminarWorkflow(req, res, next) {
    try {
      const { id } = req.params;
      const { empresaId } = req;

      await workflowsService.eliminarWorkflow(id, empresaId);

      return res.status(200).json({
        ok: true,
        mensaje: "Workflow eliminado correctamente",
        data: null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 8. Actualizar datos principales de un workflow (PUT)
   */
  async actualizarWorkflow(req, res, next) {
    try {
      const { id } = req.params;
      const { nombre, descripcion } = req.body;
      
      // Aplicando tu Regla de Oro ✨
      const empresaId = req.user?.empresa_id || req.user?.empresaId;

      if (!empresaId) {
        return res.status(400).json({ ok: false, mensaje: "El token no contiene un ID de empresa válido." });
      }

      const workflowActualizado = await workflowsService.actualizarWorkflow(id, empresaId, { nombre, descripcion });

      return res.status(200).json({
        ok: true,
        mensaje: "Workflow actualizado correctamente",
        data: workflowActualizado
      });
    } catch (error) {
      // Si el servicio lanza el error de "no existe", lo manejamos de forma limpia
      if (error.message.includes("no existe")) {
        return res.status(404).json({ ok: false, mensaje: error.message });
      }
      next(error);
    }
  },

/**
   * 9. MÓDULO 4: Simular y probar la evaluación del motor de reglas (POST)
   */
  async evaluarWorkflow(req, res, next) {
    try {
      const { id } = req.params; // ID del workflow
      const { textoCliente } = req.body; // Lo que dice el cliente

      if (!textoCliente) {
        return res.status(400).json({ ok: false, mensaje: "El campo 'textoCliente' es obligatorio para la simulación." });
      }

      // Aplicando tu Regla de Oro ✨
      const empresaId = req.user?.empresa_id || req.user?.empresaId;

      if (!empresaId) {
        return res.status(400).json({ ok: false, mensaje: "El token no contiene un ID de empresa válido." });
      }

      const resultadoEngine = await workflowsService.evaluarTexto(id, textoCliente, empresaId);

      return res.status(200).json({
        ok: true,
        mensaje: "Texto evaluado por el motor correctamente",
        data: resultadoEngine
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 5. MÓDULO 4: Listar todas las reglas de un workflow (GET)
   */
  async listarReglasWorkflow(req, res, next) {
    try {
      const { id } = req.params; // ID del workflow
      
      // Aplicando tu Regla de Oro ✨
      const empresaId = req.user?.empresa_id || req.user?.empresaId;

      if (!empresaId) {
        return res.status(400).json({ ok: false, mensaje: "El token no contiene un ID de empresa válido." });
      }

      const reglas = await workflowsService.obtenerReglasWorkflow(id, empresaId);

      return res.status(200).json({
        ok: true,
        mensaje: "Reglas del workflow obtenidas correctamente",
        data: reglas
      });
    } catch (error) {
      if (error.message.includes("no existe")) {
        return res.status(404).json({ ok: false, mensaje: error.message });
      }
      next(error);
    }
  },

  /**
   * 6. MÓDULO 4: Editar una regla dentro de un workflow (PUT)
   */
  async actualizarReglaWorkflow(req, res, next) {
    try {
      const { id, reglaId } = req.params; // Saca ambos IDs de la URL
      const { prioridad, condicion, accion } = req.body;
      
      // Aplicando tu Regla de Oro ✨
      const empresaId = req.user?.empresa_id || req.user?.empresaId;

      if (!empresaId) {
        return res.status(400).json({ ok: false, mensaje: "El token no contiene un ID de empresa válido." });
      }

      const reglaActualizada = await workflowsService.actualizarReglaWorkflow(id, reglaId, empresaId, { prioridad, condicion, accion });

      return res.status(200).json({
        ok: true,
        mensaje: "Regla actualizada correctamente",
        data: reglaActualizada
      });
    } catch (error) {
      if (error.message.includes("no existe")) {
        return res.status(404).json({ ok: false, mensaje: error.message });
      }
      next(error);
    }
  },

  /**
   * 7. MÓDULO 4: Eliminar una regla de un workflow (DELETE)
   */
  async eliminarReglaWorkflow(req, res, next) {
    try {
      const { id, reglaId } = req.params;
      
      // Aplicando tu Regla de Oro ✨
      const empresaId = req.user?.empresa_id || req.user?.empresaId;

      if (!empresaId) {
        return res.status(400).json({ ok: false, mensaje: "El token no contiene un ID de empresa válido." });
      }

      await workflowsService.eliminarReglaWorkflow(id, reglaId, empresaId);

      return res.status(200).json({
        ok: true,
        mensaje: "Regla eliminada del workflow correctamente",
        data: null
      });
    } catch (error) {
      if (error.message.includes("no existe")) {
        return res.status(404).json({ ok: false, mensaje: error.message });
      }
      next(error);
    }
  }
};

module.exports = workflowsController;