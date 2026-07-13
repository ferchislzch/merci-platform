'use strict'

const prisma = require('../../config/database')

// ─── Usuarios ─────────────────────────────────────────────────────────────────

const listar = ({ empresaId, sucursalId = null, excluirId = null, busqueda }) => {
  return prisma.usuarios.findMany({
    where: {
      empresa_id: empresaId,
      deleted_at: null,
      ...(sucursalId ? { sucursal_id: sucursalId } : {}),
      ...(excluirId   ? { id: { not: excluirId } }   : {}),
      ...(busqueda ? {
        OR: [
          { nombre:  { contains: busqueda, mode: 'insensitive' } },
          { usuario: { contains: busqueda, mode: 'insensitive' } },
          { correo:  { contains: busqueda, mode: 'insensitive' } },
        ],
      } : {}),
    },
    select: {
      id: true,
      nombre: true,
      usuario: true,
      correo: true,
      sucursal_id: true,
      ultimo_acceso: true,
      fecha_registro: true,
      catalogo_estado_usuario: { select: { id: true, nombre: true } },
      usuario_roles: {
        select: {
          catalogo_roles: { select: { id: true, nombre: true } },
        },
      },
    },
    orderBy: { fecha_registro: 'desc' },
  })
}

const buscarPorId = ({ usuarioId, empresaId, sucursalId = null }) => {
  return prisma.usuarios.findFirst({
    where: {
      id:         usuarioId,
      empresa_id: empresaId,
      deleted_at: null,
      ...(sucursalId ? { sucursal_id: sucursalId } : {}),
    },
    include: {
      catalogo_estado_usuario: true,
      sucursales: {
        select: { id: true, nombre: true },
      },
      usuario_roles: {
        include: {
          catalogo_roles: {
            include: {
              roles_permisos: { include: { permisos: true } },
            },
          },
        },
      },
    },
  })
}

const existeDuplicado = ({ empresaId, usuario, correo, excluirId = null }) => {
  return prisma.usuarios.findFirst({
    where: {
      empresa_id: empresaId,
      deleted_at: null,
      ...(excluirId ? { id: { not: excluirId } } : {}),
      OR: [{ usuario }, { correo }],
    },
    select: { id: true, usuario: true, correo: true },
  })
}

const crear = ({ empresaId, sucursalId = null, nombre, usuario, correo, passwordHash, estadoUsuarioId }) => {
  return prisma.usuarios.create({
    data: {
      empresa_id:        empresaId,
      sucursal_id:       sucursalId,
      nombre,
      usuario,
      correo,
      password_hash:     passwordHash,
      estado_usuario_id: estadoUsuarioId,
    },
    select: {
      id: true,
      nombre: true,
      usuario: true,
      correo: true,
      sucursal_id: true,
      estado_usuario_id: true,
      fecha_registro: true,
      catalogo_estado_usuario: { select: { id: true, nombre: true } },
    },
  })
}

const editar = ({ usuarioId, datos }) => {
  return prisma.usuarios.update({
    where: { id: usuarioId },
    data:  datos,
    select: {
      id: true,
      nombre: true,
      usuario: true,
      correo: true,
      sucursal_id: true,
      estado_usuario_id: true,
      catalogo_estado_usuario: { select: { id: true, nombre: true } },
    },
  })
}

const eliminar = ({ usuarioId }) => {
  return prisma.$transaction([
    prisma.sesiones.updateMany({
      where: { usuario_id: usuarioId, activo: true },
      data:  { activo: false },
    }),
    prisma.usuarios.update({
      where: { id: usuarioId },
      data:  { deleted_at: new Date() },
    }),
  ])
}

const obtenerEstadoActivo = () => {
  return prisma.catalogo_estado_usuario.findFirst({
    where:  { nombre: 'Activo', deleted_at: null },
    select: { id: true },
  })
}

const reemplazarRoles = ({ usuarioId, rolesIds }) => {
  return prisma.$transaction([
    prisma.usuario_roles.deleteMany({ where: { usuario_id: usuarioId } }),
    prisma.usuario_roles.createMany({
      data: rolesIds.map((rolId) => ({
        usuario_id: usuarioId,
        rol_id:     rolId,
      })),
    }),
  ])
}

// ─── Intentos de login ────────────────────────────────────────────────────────

const limpiarIntentosDeUsuario = ({ usuarioId, empresaId }) => {
  return prisma.intentos_login.deleteMany({
    where: { usuario_id: usuarioId, empresa_id: empresaId },
  })
}

const obtenerUsuariosBloqueados = async ({ empresaId }) => {
  const desde = new Date(Date.now() - 15 * 60 * 1000)

  const intentos = await prisma.intentos_login.findMany({
    where: {
      empresa_id: empresaId,
      fecha:      { gte: desde },
      usuario_id: { not: null },
    },
    select: { usuario_id: true },
  })

  const conteo = {}
  for (const { usuario_id } of intentos) {
    conteo[usuario_id] = (conteo[usuario_id] || 0) + 1
  }

  return new Set(
    Object.entries(conteo)
      .filter(([, count]) => count >= 5)
      .map(([id]) => id)
  )
}

const estaBloqueado = async ({ usuarioId, empresaId }) => {
  const desde = new Date(Date.now() - 15 * 60 * 1000)
  const count  = await prisma.intentos_login.count({
    where: {
      usuario_id: usuarioId,
      empresa_id: empresaId,
      fecha:      { gte: desde },
    },
  })
  return count >= 5
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const obtenerStats = async ({ empresaId, sucursalId = null }) => {
  const ahora        = new Date()
  const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

  const whereUsuarios = {
    empresa_id: empresaId,
    deleted_at: null,
    ...(sucursalId ? { sucursal_id: sucursalId } : {}),
  }

  const [totalUsuarios, nuevosEsteMes, totalRoles, sesionesActivas] =
    await prisma.$transaction([
      prisma.usuarios.count({ where: whereUsuarios }),
      prisma.usuarios.count({
        where: { ...whereUsuarios, fecha_registro: { gte: primerDiaMes } },
      }),
      prisma.catalogo_roles.count({
        where: { empresa_id: empresaId, deleted_at: null },
      }),
      prisma.sesiones.count({
        where: {
          activo:           true,
          fecha_expiracion: { gt: ahora },
          usuarios: {
            empresa_id: empresaId,
            deleted_at: null,
            ...(sucursalId ? { sucursal_id: sucursalId } : {}),
          },
        },
      }),
    ])

  return { totalUsuarios, nuevosEsteMes, totalRoles, sesionesActivas }
}

// ─── Catálogo de estados ──────────────────────────────────────────────────────

/**
 * Lista todos los estados de usuario disponibles en el catálogo.
 * Usado para rellenar el dropdown ESTADO en el form de edición.
 */
const listarEstados = () => {
  return prisma.catalogo_estado_usuario.findMany({
    where:   { deleted_at: null },
    select:  { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })
}

module.exports = {
  listar,
  buscarPorId,
  existeDuplicado,
  crear,
  editar,
  eliminar,
  obtenerEstadoActivo,
  reemplazarRoles,
  limpiarIntentosDeUsuario,
  obtenerUsuariosBloqueados,
  estaBloqueado,
  obtenerStats,
  listarEstados,
}