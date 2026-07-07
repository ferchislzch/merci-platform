// src/modules/workflows/workflows.service.js
const workflowsRepository = require('./workflows.repository');

const workflowsService = {
  /**
   * 1. Listar todos los workflows activos de la empresa
   */
  async listarWorkflows(empresaId, queryParams) {
    const { page, limit } = queryParams;
    
    // Llamamos al repositorio pasando los parámetros limpios
    return await workflowsRepository.listar({
      empresaId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10
    });
  },

  /**
   * 2. Obtener un workflow específico validando pertenencia
   */
  async obtenerWorkflowPorId(id, empresaId) {
    const workflow = await workflowsRepository.obtenerPorId(id, empresaId);
    if (!workflow) {
      throw new NotFoundError("El workflow solicitado no existe o no pertenece a esta empresa.");
    }
    return workflow;
  },

  /**
   * 3. Crear un flujo base junto con su versión 1 activa por defecto
   */
  async crear({ nombre, descripcion, empresaId, usuarioId }) {
    // 1. Crear el objeto base del workflow
    const nuevoWorkflow = await workflowsRepository.crear({ nombre, descripcion, empresaId });
    
    // 2. Crear inmediatamente la versión 1 de forma activa por defecto (v1.0)
    const versionUno = await workflowsRepository.crearVersion(nuevoWorkflow.id, {
      version: 1,
      descripcion: "Versión inicial autogenerada",
      esActiva: true,
      empresaId,
      usuarioId
    });

    return {
      ...nuevoWorkflow,
      versiones: [versionUno]
    };
  },

  /**
   * 4. Crear una nueva versión e insertar reglas de negocio sin sobrescribir el historial
   */
  async crearVersionWorkflow(workflowId, { descripcion, reglas, empresaId }) {
    // Validar primero que el workflow base exista y sea de la empresa
    await this.obtenerWorkflowPorId(workflowId, empresaId);

    // Obtener la última versión para calcular el consecuente correlativo (ej: v2.0, v3.0, etc.)
    const ultimaVersion = await workflowsRepository.obtenerUltimaVersion(workflowId);
    let nuevoNumeroVersion = 1;
    if (ultimaVersion && ultimaVersion.version) {
      const numeroActual = parseFloat(ultimaVersion.version.replace('v', ''));
      nuevoNumeroVersion = `v${(numeroActual + 1).toFixed(1)}`;
    }

    // Crear la nueva versión (marcada como activa)
    // Nota: El trigger en tu base de datos desactivará las anteriores de forma automática
    const nuevaVersion = await workflowsRepository.crearVersion(workflowId, {
      version: nuevoNumeroVersion,
      descripcion: descripcion || `Nueva versión ${nuevoNumeroVersion}`,
      esActiva: true,
      empresaId
    });

    // Si se enviaron reglas en el body, las creamos vinculadas a esta nueva versión
    if (reglas && Array.isArray(reglas) && reglas.length > 0) {
      for (const [index, regla] of reglas.entries()) {
        await workflowsRepository.crearRegla(nuevaVersion.id, {
          nombre: regla.nombre,
          condicion: regla.condicion, // Formato JSON acordado
          accion: regla.accion,       // Formato JSON acordado
          prioridad: regla.prioridad || (index + 1),
          empresaId
        });
      }
    }

    // Retornamos la versión con sus reglas cargadas
    return await workflowsRepository.obtenerVersionConReglas(nuevaVersion.id);
  },

  /**
   * 5. Clonar un flujo completo (Workflow + última configuración de reglas)
   */
  async clonarWorkflow(id, empresaId) {
    const workflowOriginal = await this.obtenerWorkflowPorId(id, empresaId);
    const ultimaVersionOriginal = await workflowsRepository.obtenerUltimaVersion(id);

    // Crear el nuevo flujo copia
    const workflowClonado = await workflowsRepository.crear({
      nombre: `${workflowOriginal.nombre} (Copia)`,
      descripcion: workflowOriginal.descripcion,
      empresaId
    });

    // Crear su versión 1 de la copia
    const nuevaVersionClonada = await workflowsRepository.crearVersion(workflowClonado.id, {
      version: "v1.0",
      descripcion: `Clonado desde la versión ${ultimaVersionOriginal?.version || 'base'} de ${workflowOriginal.nombre}`,
      esActiva: true,
      empresaId
    });

    // Si el original tenía reglas en su última versión, las copiamos con el mismo orden
    if (ultimaVersionOriginal) {
      const reglasOriginales = await workflowsRepository.listarReglasPorVersion(ultimaVersionOriginal.id);
      for (const regla of reglasOriginales) {
        await workflowsRepository.crearRegla(nuevaVersionClonada.id, {
          nombre: regla.nombre,
          condicion: regla.condicion,
          accion: regla.accion,
          prioridad: regla.prioridad,
          empresaId
        });
      }
    }

    return await workflowsRepository.obtenerPorId(workflowClonado.id, empresaId);
  },

  /**
   * 6. Activar una versión específica
   */
  async activarVersion(workflowId, versionId, empresaId) {
    await this.obtenerWorkflowPorId(workflowId, empresaId);
    
    // Cambiamos el estado a activo. Tu base de datos tiene un trigger que limpia los demás flags de "es_activa"
    await workflowsRepository.marcarVersionComoActiva(versionId);
    return true;
  },

  /**
   * 7. Soft Delete del Workflow completo
   */
  async eliminarWorkflow(id, empresaId) {
    await this.obtenerWorkflowPorId(id, empresaId);
    await workflowsRepository.eliminarSoft(id);
    return true;
  },

async obtenerPorId(id) {
    const workflow = await workflowsRepository.obtenerPorId(id);
    
    if (!workflow) {
      const error = new Error('El workflow solicitado no existe o fue eliminado');
      error.statusCode = 404; // Código HTTP para "No encontrado"
      throw error;
    }
    
    return workflow;
  },

  async obtenerWorkflowPorId(id, empresaId) {
    const workflow = await workflowsRepository.obtenerPorId(id, empresaId);
    
    if (!workflow) {
      const error = new Error('El workflow solicitado no existe, fue eliminado o no tienes permisos.');
      error.statusCode = 404;
      throw error;
    }

    // 👇 ORDENAMIENTO SEGURO EN JAVASCRIPT
    // Si existen versiones y es un arreglo, las ordenamos de la más nueva (mayor) a la más antigua (menor)
    if (workflow.workflow_versiones && Array.isArray(workflow.workflow_versiones)) {
      workflow.workflow_versiones.sort((a, b) => b.version - a.version);
    }
    
    return workflow;
  },

  async actualizarWorkflow(id, empresaId, datosActualizar) {
    // 1. Verificamos que exista y pertenezca a la empresa usando tu método existente
    const workflowExistente = await workflowsRepository.obtenerPorId(id, empresaId);
    
    if (!workflowExistente) {
      throw new Error("El workflow solicitado no existe, fue eliminado o no tienes permisos.");
    }

    // 2. Mandamos a actualizar los campos modificables
    await workflowsRepository.actualizar(id, empresaId, {
      nombre: datosActualizar.nombre || workflowExistente.nombre,
      descripcion: datosActualizar.descripcion || workflowExistente.descripcion
    });

    // 3. Retornamos el objeto actualizado limpio
    return await workflowsRepository.obtenerPorId(id, empresaId);
  },

  // MÓDULO 4: Motor de evaluación de reglas
  async evaluarTexto(workflowId, textoCliente, empresaId) {
    // 1. Validamos primero si el workflow existe y es de la empresa
    const workflow = await workflowsRepository.obtenerPorId(workflowId, empresaId);
    if (!workflow) {
      throw new Error("El workflow solicitado no existe o no pertenece a tu empresa.");
    }

    // 2. Traemos sus reglas ordenadas por prioridad
    const reglas = await workflowsRepository.obtenerReglasParaMotor(workflowId);

    // Pasamos el texto del cliente a minúsculas para que la comparación no falle por mayúsculas
    const textoLimpio = textoCliente.toLowerCase().trim();

    // 3. Recorremos las reglas en estricto orden de prioridad
    for (const regla of reglas) {
      const condicion = regla.condicion; 
      const accion = regla.accion;

      // 🛡️ VALIDACIÓN ULTRA SEGURA: Comprobamos que condicion exista, sea un objeto y no sea null
      if (condicion && typeof condicion === 'object' && 'tipo' in condicion) {
        
        // Validamos si la condición es por palabra clave y tiene un array de valores
        if (condicion.tipo === 'palabra_clave' && Array.isArray(condicion.valores)) {
          
          // Verificamos si alguna de las palabras clave de la regla está en lo que dijo el cliente
          const coincidencia = condicion.valores.some(palabra => 
            typeof palabra === 'string' && textoLimpio.includes(palabra.toLowerCase().trim())
          );

          if (coincidencia) {
            // ¡Contrato de respuesta exitosa del Módulo 4!
            return {
              reglaDisparada: true,
              reglaId: regla.id,
              accion: {
                tipo: accion?.tipo || "transferir",
                destino: accion?.destino || null
              }
            };
          }
        }
      }
    }

    // Si terminó el ciclo y ninguna regla coincidió, se devuelve el contrato por defecto
    return { 
      reglaDisparada: false 
    };
  },

  // MÓDULO 4: Servicio para listar reglas
  async obtenerReglasWorkflow(workflowId, empresaId) {
    // Validamos que el workflow pertenezca a la empresa
    const workflow = await workflowsRepository.obtenerPorId(workflowId, empresaId);
    if (!workflow) {
      throw new Error("El workflow solicitado no existe o no tienes permisos.");
    }

    return await workflowsRepository.listarReglas(workflowId);
  },

  // MÓDULO 4: Servicio para editar una regla
  async actualizarReglaWorkflow(workflowId, reglaId, empresaId, datosActualizar) {
    // Validamos la pertenencia del workflow por seguridad
    const workflow = await workflowsRepository.obtenerPorId(workflowId, empresaId);
    if (!workflow) {
      throw new Error("El workflow solicitado no existe o no tienes permisos.");
    }

    return await workflowsRepository.actualizarRegla(reglaId, {
      prioridad: datosActualizar.prioridad,
      condicion: datosActualizar.condicion,
      accion: datosActualizar.accion
    });
  },

  // MÓDULO 4: Servicio para eliminar una regla
  async eliminarReglaWorkflow(workflowId, reglaId, empresaId) {
    const workflow = await workflowsRepository.obtenerPorId(workflowId, empresaId);
    if (!workflow) {
      throw new Error("El workflow solicitado no existe o no tienes permisos.");
    }

    return await workflowsRepository.eliminarRegla(reglaId);
  }
};

module.exports = workflowsService;
