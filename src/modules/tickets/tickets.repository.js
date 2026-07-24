const prisma = require('../../config/database');

// 1. Obtener todos los tickets de una empresa
const obtenerTicketsPorEmpresaBD = async (empresa_id) => {
  return await prisma.tickets.findMany({
    where: {
      empresa_id: String(empresa_id),
      deleted_at: null
    },
    include: {
      clientes: {
        select: { id: true, nombre: true, apellido: true, empresa_cliente: true }
      },
      usuarios: {
        select: { id: true, nombre: true, correo: true }
      },
      catalogo_estado_ticket: true,
      catalogo_prioridad_ticket: true,
      departamentos: { select: { id: true, nombre: true } },
      llamadas: { select: { id: true, pbx_call_id: true, numero_origen: true } },
      ticket_comentarios: {
        include: {
          usuarios: { select: { id: true, nombre: true } }
        },
        orderBy: { fecha_registro: 'asc' }
      }
    },
    orderBy: {
      fecha_creacion: 'desc'
    }
  });
};

// 2. Obtener un ticket por ID
const obtenerTicketPorIdBD = async (id) => {
  return await prisma.tickets.findFirst({
    where: {
      id: String(id),
      deleted_at: null
    },
    include: {
      clientes: { select: { id: true, nombre: true, apellido: true } },
      usuarios: { select: { id: true, nombre: true, correo: true } },
      catalogo_estado_ticket: true,
      catalogo_prioridad_ticket: true,
      departamentos: { select: { id: true, nombre: true } },
      ticket_comentarios: {
        include: {
          usuarios: { select: { id: true, nombre: true } }
        },
        orderBy: { fecha_registro: 'asc' }
      }
    }
  });
};

// 3. Crear ticket
const crearTicketBD = async (datos) => {
  return await prisma.tickets.create({
    data: {
      empresa_id: String(datos.empresa_id),
      titulo: datos.titulo,
      descripcion: datos.descripcion,
      prioridad_ticket_id: datos.prioridad_ticket_id ? String(datos.prioridad_ticket_id) : null,
      estado_ticket_id: datos.estado_ticket_id ? String(datos.estado_ticket_id) : null,
      departamento_id: datos.departamento_id ? String(datos.departamento_id) : null,
      cliente_id: datos.cliente_id ? String(datos.cliente_id) : null,
      usuario_responsable_id: datos.usuario_responsable_id ? String(datos.usuario_responsable_id) : null,
      llamada_id: datos.llamada_id ? String(datos.llamada_id) : null
    },
    include: {
      catalogo_estado_ticket: true,
      catalogo_prioridad_ticket: true,
      clientes: true
    }
  });
};

// 4. Actualizar ticket
const actualizarTicketBD = async (id, datos) => {
  return await prisma.tickets.update({
    where: { id: String(id) },
    data: {
      ...(datos.titulo && { titulo: datos.titulo }),
      ...(datos.descripcion && { descripcion: datos.descripcion }),
      ...(datos.estado_ticket_id && { estado_ticket_id: String(datos.estado_ticket_id) }),
      ...(datos.prioridad_ticket_id && { prioridad_ticket_id: String(datos.prioridad_ticket_id) }),
      ...(datos.departamento_id && { departamento_id: String(datos.departamento_id) }),
      ...(datos.usuario_responsable_id && { usuario_responsable_id: String(datos.usuario_responsable_id) }),
      ...(datos.cliente_id && { cliente_id: String(datos.cliente_id) }),
      ...(datos.fecha_cierre && { fecha_cierre: datos.fecha_cierre })
    }
  });
};

// 5. Eliminar ticket (Soft Delete)
const eliminarTicketBD = async (id) => {
  return await prisma.tickets.update({
    where: { id: String(id) },
    data: { deleted_at: new Date() }
  });
};

module.exports = {
  obtenerTicketsPorEmpresaBD,
  obtenerTicketPorIdBD,
  crearTicketBD,
  actualizarTicketBD,
  eliminarTicketBD
};