const {
  obtenerTicketsPorEmpresaBD,
  obtenerTicketPorIdBD,
  crearTicketBD,
  actualizarTicketBD,
  eliminarTicketBD
} = require('./tickets.repository');

const obtenerTickets = async (req, res) => {
  try {
    const { empresa_id } = req.query;
    if (!empresa_id) {
      return res.status(400).json({ ok: false, mensaje: 'El parámetro empresa_id es requerido' });
    }
    const tickets = await obtenerTicketsPorEmpresaBD(empresa_id);
    res.json({ ok: true, data: tickets });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message });
  }
};

const obtenerTicketPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await obtenerTicketPorIdBD(id);
    if (!ticket) {
      return res.status(404).json({ ok: false, mensaje: 'Ticket no encontrado' });
    }
    res.json({ ok: true, data: ticket });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message });
  }
};

const crearTicket = async (req, res) => {
  try {
    const ticketNuevo = await crearTicketBD(req.body);
    res.status(201).json({ ok: true, mensaje: 'Ticket creado exitosamente', data: ticketNuevo });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message });
  }
};

const actualizarTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const ticketActualizado = await actualizarTicketBD(id, req.body);
    res.json({ ok: true, mensaje: 'Ticket actualizado exitosamente', data: ticketActualizado });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message });
  }
};

const eliminarTicket = async (req, res) => {
  try {
    const { id } = req.params;
    await eliminarTicketBD(id);
    res.json({ ok: true, mensaje: 'Ticket eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message });
  }
};

const agregarComentario = async (req, res) => {
  res.json({ ok: true, mensaje: 'Pendiente lógica comentario' });
};

const obtenerCatalogos = async (req, res) => {
  res.json({ ok: true, mensaje: 'Pendiente lógica catálogos' });
};

module.exports = {
  obtenerTickets,
  obtenerTicketPorId,
  crearTicket,
  actualizarTicket,
  eliminarTicket,
  agregarComentario,
  obtenerCatalogos
};