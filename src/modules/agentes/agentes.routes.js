const express = require('express');
const router = express.Router();
const agentesController = require('./agentes.controller');

const authenticate = require('../../core/middlewares/auth.middleware');

// Endpoints de Agentes Virtuales (Módulo 1)
router.get('/', authenticate, agentesController.obtenerAgentes);
router.get('/:id', authenticate, agentesController.obtenerAgentePorId);
router.post('/', authenticate, agentesController.crearAgente); 
router.put('/:id', authenticate, agentesController.actualizarAgente);
router.patch('/:id/estado', authenticate, agentesController.cambiarEstadoAgente);
router.delete('/:id', authenticate, agentesController.eliminarAgente);

const promptsRouter = require('../prompts/prompts.routes');
router.use('/:id/prompts', promptsRouter);

module.exports = router;