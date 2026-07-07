const express = require('express');
const router = express.Router();
const workflowsController = require('./workflows.controller');

const authenticate = require('../../core/middlewares/auth.middleware');

// 1. Listar todos los workflows de la empresa (Filtrado por empresa y no eliminados)
router.get('/', authenticate, workflowsController.listarWorkflows);

// 2. Obtener un workflow específico por su ID con sus versiones y reglas
router.get('/:id', authenticate, workflowsController.obtenerWorkflowPorId);

// 3. Crear un nuevo workflow (Crea el workflow base y su primera versión v1 activa por defecto)
router.post('/', authenticate, workflowsController.crearWorkflow);

// 4. Crear una nueva versión para un workflow existente (Hereda reglas o inicia limpia, marca como activa)
router.post('/:id/versiones', authenticate, workflowsController.crearVersionWorkflow);

// 5. Clonar un workflow completo con su última versión y reglas
router.post('/:id/clonar', authenticate, workflowsController.clonarWorkflow);

// 6. Cambiar la versión activa de un workflow (El trigger de la BD se encargará de desactivar el resto)
router.patch('/:id/versiones/:versionId/activar', authenticate, workflowsController.activarVersion);

// 7. Eliminar un workflow (¡Recuerda: Soft Delete!)
router.delete('/:id', authenticate, workflowsController.eliminarWorkflow);

// 8. Actualizar un workflow específico
router.put('/:id', authenticate, workflowsController.actualizarWorkflow);

// Módulo 4: Obtener la lista de reglas de un workflow
router.get('/:id/reglas', authenticate, workflowsController.listarReglasWorkflow);

// Módulo 3: Crear una regla nueva dentro de un workflow (ESTA ES LA QUE FALTA 🚀)
router.post('/:id/reglas', authenticate, workflowsController.listarReglasWorkflow);

// Módulo 4: Evaluar motor de reglas pasando el ID del workflow
router.post('/:id/evaluar', authenticate, workflowsController.evaluarWorkflow);

// Módulo 4: Editar una regla específica usando su ID
router.put('/:id/reglas/:reglaId', authenticate, workflowsController.actualizarReglaWorkflow);

// Módulo 4: Eliminar una regla específica mediante borrado lógico
router.delete('/:id/reglas/:reglaId', authenticate, workflowsController.eliminarReglaWorkflow);

module.exports = router;