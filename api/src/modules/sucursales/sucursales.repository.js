const prisma = require('../../config/database')

// ─── Sucursales ───────────────────────────────────────────────────────────────

const listarSucursales = ({ empresaId }) => {
  return prisma.sucursales.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    include: {
      departamentos: {
        where: { deleted_at: null },
        select: { id: true, nombre: true },
      },
    },
    orderBy: { fecha_registro: 'asc' },
  })
}

const buscarSucursalPorId = ({ sucursalId, empresaId }) => {
  return prisma.sucursales.findFirst({
    where: { id: sucursalId, empresa_id: empresaId, deleted_at: null },
    include: {
      departamentos: {
        where: { deleted_at: null },
        select: { id: true, nombre: true },
      },
    },
  })
}

const crearSucursal = ({ empresaId, nombre, direccion, telefono, correo }) => {
  return prisma.sucursales.create({
    data: { empresa_id: empresaId, nombre, direccion, telefono, correo },
    select: { id: true, nombre: true, direccion: true, telefono: true, correo: true, fecha_registro: true },
  })
}

const editarSucursal = ({ sucursalId, datos }) => {
  return prisma.sucursales.update({
    where: { id: sucursalId },
    data: datos,
    select: { id: true, nombre: true, direccion: true, telefono: true, correo: true },
  })
}

const eliminarSucursal = ({ sucursalId }) => {
  return prisma.sucursales.update({
    where: { id: sucursalId },
    data: { deleted_at: new Date() },
  })
}

// ─── Departamentos ────────────────────────────────────────────────────────────

const listarDepartamentos = ({ sucursalId }) => {
  return prisma.departamentos.findMany({
    where: { sucursal_id: sucursalId, deleted_at: null },
    select: { id: true, nombre: true, fecha_registro: true },
    orderBy: { fecha_registro: 'asc' },
  })
}

const buscarDepartamentoPorId = ({ departamentoId, empresaId }) => {
  // Filtramos por empresa pasando por la relación con sucursal
  // (departamentos no tiene empresa_id directo)
  return prisma.departamentos.findFirst({
    where: {
      id: departamentoId,
      deleted_at: null,
      sucursales: { empresa_id: empresaId, deleted_at: null },
    },
    include: {
      sucursales: { select: { id: true, nombre: true, empresa_id: true } },
    },
  })
}

const crearDepartamento = ({ sucursalId, nombre }) => {
  return prisma.departamentos.create({
    data: { sucursal_id: sucursalId, nombre },
    select: { id: true, nombre: true, sucursal_id: true, fecha_registro: true },
  })
}

const editarDepartamento = ({ departamentoId, nombre }) => {
  return prisma.departamentos.update({
    where: { id: departamentoId },
    data: { nombre },
    select: { id: true, nombre: true },
  })
}

const eliminarDepartamento = ({ departamentoId }) => {
  return prisma.departamentos.update({
    where: { id: departamentoId },
    data: { deleted_at: new Date() },
  })
}

module.exports = {
  listarSucursales,
  buscarSucursalPorId,
  crearSucursal,
  editarSucursal,
  eliminarSucursal,
  listarDepartamentos,
  buscarDepartamentoPorId,
  crearDepartamento,
  editarDepartamento,
  eliminarDepartamento,
}