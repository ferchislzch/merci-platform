const express = require('express');
// 👇 El mergeParams: true es VITAL para capturar el ':id' del agente
const router = express.Router({ mergeParams: true }); 
const promptsController = require('./prompts.controller');
const authenticate = require('../../core/middlewares/auth.middleware');


router.use(authenticate);

// 1. GET /api/agentes/:id/prompts (Listar historial)
router.get('/', promptsController.obtenerVersionesPorAgente);

// 2. POST /api/agentes/:id/prompts (Crear nueva versión)
router.post('/', promptsController.crearVersionPrompt);

// 3. POST /api/agentes/:id/prompts/:version/restaurar (Restaurar versión)
router.post('/:version/restaurar', promptsController.restaurarVersionPrompt);

module.exports = router;