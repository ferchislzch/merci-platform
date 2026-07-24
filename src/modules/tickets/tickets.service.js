const repository = require('./tickets.repository.js');

const obtenerTicketsService = async (empresa_id) => {
  if (!empresa_id) {
    throw new Error('El empresa_id es requerido para consultar los tickets');
  }
  return await repository.obtenerTicketsPorEmpresaBD(empresa_id);
};

/**
 * Función reutilizable para crear tickets.
 * Puede ser llamada desde el controlador HTTP o desde ganchos/workflows del backend.
 */
const crearTicketService = async (datosTicket) => {
  const { empresa_id, titulo } = datosTicket;

  if (!empresa_id || !titulo) {
    throw new Error('empresa_id y titulo son campos obligatorios para crear un ticket');
  }

  return await repository.crearTicketBD(datosTicket);
};

const agregarComentarioService = async (datosComentario) => {
  const { ticket_id, usuario_id, comentario } = datosComentario;

  if (!ticket_id || !usuario_id || !comentario) {
    throw new Error('ticket_id, usuario_id y comentario son obligatorios');
  }

  return await repository.crearComentarioBD(datosComentario);
};

const obtenerCatalogosService = async () => {
  return await repository.obtenerCatalogosBD();
};

module.exports = {
  obtenerTicketsService,
  crearTicketService,
  agregarComentarioService,
  obtenerCatalogosService
};