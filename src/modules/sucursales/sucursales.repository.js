'use strict'

const prisma = require('../../config/database')

const listarSucursales = ({ empresaId }) =>
  prisma.sucursales.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    orderBy: { fecha_registro: 'asc' },
  })

const buscarSucursalPorId = ({ sucursalId, empresaId }) =>
  prisma.sucursales.findFirst({
    where: { id: sucursalId, empresa_id: empresaId, deleted_at: null },
  })

const crearSucursal = ({ empresaId, nombre, direccion, telefono, correo }) =>
  prisma.sucursales.create({
    data: { empresa_id: empresaId, nombre, direccion, telefono, correo },
    select: {
      id: true, nombre: true, direccion: true,
      telefono: true, correo: true, fecha_registro: true,
    },
  })

const editarSucursal = ({ sucursalId, datos }) =>
  prisma.sucursales.update({
    where: { id: sucursalId },
    data: datos,
    select: {
      id: true, nombre: true, direccion: true,
      telefono: true, correo: true,
    },
  })

// Soft delete
const eliminarSucursal = ({ sucursalId }) =>
  prisma.sucursales.update({
    where: { id: sucursalId },
    data: { deleted_at: new Date() },
  })

module.exports = {
  listarSucursales,
  buscarSucursalPorId,
  crearSucursal,
  editarSucursal,
  eliminarSucursal,
}