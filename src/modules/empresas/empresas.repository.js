const prisma = require('../../config/database')

const listar = () => {
  return prisma.empresas.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      nombre_comercial: true,
      razon_social: true,
      rfc: true,
      telefono: true,
      correo: true,
      status: true,
      fecha_registro: true,
      fecha_actualizacion: true,
    },
    orderBy: { fecha_registro: 'desc' },
  })
}

const buscarPorId = ({ empresaId }) => {
  return prisma.empresas.findFirst({
    where: { id: empresaId, deleted_at: null },
    select: {
      id: true,
      nombre_comercial: true,
      razon_social: true,
      rfc: true,
      telefono: true,
      correo: true,
      status: true,
      fecha_registro: true,
      fecha_actualizacion: true,
    },
  })
}

const crear = ({ nombre_comercial, razon_social, rfc, telefono, correo }) => {
  return prisma.empresas.create({
    data: { nombre_comercial, razon_social, rfc, telefono, correo, status: 'activo' },
    select: {
      id: true,
      nombre_comercial: true,
      razon_social: true,
      rfc: true,
      status: true,
      fecha_registro: true,
    },
  })
}

const editar = ({ empresaId, datos }) => {
  return prisma.empresas.update({
    where: { id: empresaId },
    data: datos,
    select: {
      id: true,
      nombre_comercial: true,
      razon_social: true,
      rfc: true,
      telefono: true,
      correo: true,
      status: true,
    },
  })
}

/**
 * Soft delete de empresa — marca deleted_at.
 * Todos los datos relacionados (usuarios, agentes, llamadas, etc.)
 * siguen existiendo en BD por el CASCADE que solo aplica si se borra
 * la fila real. El soft delete los deja intactos.
 */
const eliminar = ({ empresaId }) => {
  return prisma.empresas.update({
    where: { id: empresaId },
    data: { deleted_at: new Date(), status: 'cancelado' },
  })
}

const cambiarStatus = ({ empresaId, status }) => {
  return prisma.empresas.update({
    where: { id: empresaId },
    data: { status },
    select: { id: true, nombre_comercial: true, status: true },
  })
}

module.exports = { listar, buscarPorId, crear, editar, eliminar, cambiarStatus }