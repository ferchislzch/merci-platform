const { Router } = require('express');
const {
  obtenerTickets,
  obtenerTicketPorId,
  crearTicket,
  actualizarTicket,
  eliminarTicket,
  agregarComentario,
  obtenerCatalogos
} = require('./tickets.controller.js');

const router = Router();

router.get('/catalogos', obtenerCatalogos);
router.get('/', obtenerTickets);
router.get('/:id', obtenerTicketPorId);
router.post('/', crearTicket);
router.post('/comentarios', agregarComentario);
router.put('/:id', actualizarTicket);
router.delete('/:id', eliminarTicket);

module.exports = router;