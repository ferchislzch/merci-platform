// src/modules/workflows/workflows.repository.js
const prisma = require('../../config/database');

const workflowsRepository = {
  // 1. Función para crear el Workflow
  async crear({ nombre, descripcion, empresaId }) {
    return await prisma.workflows.create({
      data: {
        nombre,
        descripcion,
        empresa_id: empresaId
      }
    });
  },

  // 2. Función para crear la versión (La que ya tenías funcionando)
  async crearVersion(workflowId, { version, descripcion, esActiva, empresaId, usuarioId }) {
    const modeloVersiones = prisma.workflow_versiones || prisma.versiones || prisma.workflowVersiones;
    
    return await modeloVersiones.create({
      data: {
        version: version,
        descripcion_cambio: descripcion,
        es_activa: esActiva,
        workflow_id: workflowId,
        usuario_id: usuarioId,
        configuracion: {}
      }
    });
  },

  // 3. Función para obtener por ID (Corregida sin el orderBy conflictivo)
  async obtenerPorId(id, empresaId) {
    const workflow = await prisma.workflows.findFirst({
      where: {
        id: id,
        empresa_id: empresaId,
        deleted_at: null
      },
      include: {
        workflow_versiones: true 
      }
    });

    // Validamos con un "Array.isArray" si realmente es un arreglo antes de ordenarlo
    if (workflow && workflow.workflow_versiones && Array.isArray(workflow.workflow_versiones)) {
      workflow.workflow_versiones.sort((a, b) => b.version - a.version);
    }

    return workflow;
  },

  // 4. Función para borrado lógico (Aseguramos que exista dentro del objeto)
  async eliminarSoft(id, empresaId) {
    return await prisma.workflows.updateMany({
      where: {
        id: id,
        empresa_id: empresaId,
        deleted_at: null
      },
      data: {
        deleted_at: new Date()
      }
    });
  },

  // 5. Función para listar todos los workflows de una empresa (con paginación)
  async listar({ empresaId, page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;

    // Ejecutamos ambas consultas en paralelo para mejorar el rendimiento
    const [total, data] = await prisma.$transaction([
      prisma.workflows.count({
        where: {
          empresa_id: empresaId,
          deleted_at: null // 👈 Ignoramos los eliminados lógicamente
        }
      }),
      prisma.workflows.findMany({
        where: {
          empresa_id: empresaId,
          deleted_at: null
        },
        include: {
          // Incluimos la relación para saber si tiene versiones asociadas
          workflow_versiones: true 
        },
        orderBy: {
          fecha_registro: 'desc' // Los más nuevos primero
        },
        skip: parseInt(skip),
        take: parseInt(limit)
      })
    ]);

    return {
      total,
      paginas: Math.ceil(total / limit),
      pagina_actual: parseInt(page),
      limite: parseInt(limit),
      data
    };
  },

  // 6. Actualizar datos principales del workflow
  async actualizar(id, empresaId, { nombre, descripcion }) {
    return await prisma.workflows.updateMany({
      where: {
        id: id,
        empresa_id: empresaId,
        deleted_at: null // Solo actualiza si no está borrado
      },
      data: {
        nombre,
        descripcion,
        fecha_actualizacion: new Date() // Forzamos la actualización de la estampa de tiempo
      }
    });
  },

async obtenerReglasParaMotor(workflowId) {
    // Buscamos las reglas vigentes de este workflow, ordenadas de menor a mayor prioridad
    return await prisma.reglas_workflow.findMany({
      where: {
        workflow_id: workflowId,
        deleted_at: null // Ignoramos las reglas eliminadas lógicamente
      },
      orderBy: {
        prioridad: 'asc' // 1 es más importante que 2, se evalúan en ese estricto orden
      }
    });
  },

// MÓDULO 4: Listar reglas vigentes de un workflow
  async listarReglas(workflowId) {
    return await prisma.reglas_workflow.findMany({
      where: {
        workflow_id: workflowId,
        deleted_at: null // 🛡️ Regla de oro: Ignoramos las eliminadas
      },
      orderBy: {
        prioridad: 'asc' // Las devolvemos ordenadas por su nivel de importancia
      }
    });
  },

  // MÓDULO 4: Editar una regla existente
  async actualizarRegla(reglaId, { prioridad, condicion, accion }) {
    return await prisma.reglas_workflow.update({
      where: {
        id: reglaId
      },
      data: {
        prioridad: prioridad ? parseInt(prioridad) : undefined,
        condicion: condicion,
        accion: accion
      }
    });
  },

  // MÓDULO 4: Soft delete de una regla
  async eliminarRegla(reglaId) {
    return await prisma.reglas_workflow.update({
      where: {
        id: reglaId
      },
      data: {
        deleted_at: new Date() // Estampa de tiempo para marcarla como eliminada
      }
    });
  }
};

module.exports = workflowsRepository;