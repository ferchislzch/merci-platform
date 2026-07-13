'use strict'

const prisma = require('../../config/database')

// Verifica empresa via relación sucursal → empresa (departamentos no tiene empresa_id directo)
const listar = ({ sucursalId }) =>
  prisma.departamentos.findMany({
    where: { sucursal_id: sucursalId, deleted_at: null },
    select: { id: true, nombre: true, fecha_registro: true },
    orderBy: { fecha_registro: 'asc' },
  })

const buscarPorId = ({ departamentoId, empresaId }) =>
  prisma.departamentos.findFirst({
    where: {
      id: departamentoId,
      deleted_at: null,
      sucursales: { empresa_id: empresaId, deleted_at: null },
    },
    select: {
      id: true,
      nombre: true,
      fecha_registro: true,
      sucursales: { select: { id: true, nombre: true } },
    },
  })

const crear = ({ sucursalId, nombre }) =>
  prisma.departamentos.create({
    data: { sucursal_id: sucursalId, nombre },
    select: { id: true, nombre: true, sucursal_id: true, fecha_registro: true },
  })

const editar = ({ departamentoId, nombre }) =>
  prisma.departamentos.update({
    where: { id: departamentoId },
    data: { nombre },
    select: { id: true, nombre: true, fecha_registro: true },
  })

// Soft delete
const eliminar = ({ departamentoId }) =>
  prisma.departamentos.update({
    where: { id: departamentoId },
    data: { deleted_at: new Date() },
  })

module.exports = { listar, buscarPorId, crear, editar, eliminar }