'use strict'

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
      codigo_acceso: true, // ← NUEVO
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
      codigo_acceso: true, // ← NUEVO
      fecha_registro: true,
      fecha_actualizacion: true,
    },
  })
}

// ── NUEVO: verificar si un código ya existe ────────────────────────────────────
const buscarPorCodigo = (codigoAcceso) => {
  return prisma.empresas.findFirst({
    where: { codigo_acceso: codigoAcceso, deleted_at: null },
    select: { id: true },
  })
}

// ── ACTUALIZADO: acepta codigoAcceso ─────────────────────────────────────────
const crear = ({ nombre_comercial, razon_social, rfc, telefono, correo, codigoAcceso }) => {
  return prisma.empresas.create({
    data: {
      nombre_comercial,
      razon_social,
      rfc,
      telefono,
      correo,
      status:        'activo',
      codigo_acceso: codigoAcceso, // ← NUEVO
    },
    select: {
      id: true,
      nombre_comercial: true,
      razon_social: true,
      rfc: true,
      status: true,
      codigo_acceso: true, // ← NUEVO
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
      codigo_acceso: true, // ← NUEVO
    },
  })
}

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

module.exports = { listar, buscarPorId, buscarPorCodigo, crear, editar, eliminar, cambiarStatus }