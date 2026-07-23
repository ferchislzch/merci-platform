'use strict'

const prisma = require('../../config/database')

// Permisos excluidos del rol "Administrador de Sucursal": todo lo que sea
// gestión de TODA la empresa (no solo de su sucursal). `sucursales.ver` se
// agregó junto a `sucursales.gestionar` para ocultar la vista de Sucursales
// por completo (antes solo se excluía gestionar, dejando ver visible).
const PERMISOS_EXCLUIDOS_ADMIN_SUCURSAL = [
  'sucursales.ver',
  'sucursales.gestionar',
  'empresa.configurar',
  'auditoria.ver',
  'auditoria.exportar',
]

// Permisos excluidos del rol "Administrador General": gestionar departamentos
// requiere estar asociado a UNA sucursal (departamentos.crear() usa el
// sucursalId del JWT tal cual, sin validar null), y Admin General tiene
// sucursalId = null por diseño (ve toda la empresa, no está atado a una).
const PERMISOS_EXCLUIDOS_ADMIN_GENERAL = [
  'departamentos.ver',
  'departamentos.gestionar',
]

// Colores fijos de los roles por defecto — mismos que ya se usan en el
// mockup de diseño, para que el primer vistazo a Roles y Permisos ya se vea
// consistente sin depender de la asignación aleatoria del frontend.
const COLOR_ADMIN_GENERAL = '#F59E0B'  // ámbar
const COLOR_ADMIN_SUCURSAL = '#3B82F6' // azul

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
      codigo_acceso: true,
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
      codigo_acceso: true,
      fecha_registro: true,
      fecha_actualizacion: true,
    },
  })
}

const buscarPorCodigo = (codigoAcceso) => {
  return prisma.empresas.findFirst({
    where: { codigo_acceso: codigoAcceso, deleted_at: null },
    select: { id: true },
  })
}

const crear = ({ nombre_comercial, razon_social, rfc, telefono, correo, codigoAcceso }) => {
  return prisma.empresas.create({
    data: {
      nombre_comercial,
      razon_social,
      rfc,
      telefono,
      correo,
      status:        'activo',
      codigo_acceso: codigoAcceso,
    },
    select: {
      id: true,
      nombre_comercial: true,
      razon_social: true,
      rfc: true,
      status: true,
      codigo_acceso: true,
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
      codigo_acceso: true,
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

// ─── NUEVO — roles por defecto al crear empresa ───────────────────────────────

/**
 * Crea los 2 roles predeterminados de toda empresa nueva y les asigna
 * sus permisos correspondientes en una sola transacción.
 *
 * Administrador General     → todos los permisos del catálogo EXCEPTO
 *                              departamentos.ver/gestionar (requieren estar
 *                              atado a una sucursal; Admin General no lo está).
 *                              Además queda marcado es_protegido: true —
 *                              invisible/inmutable para toda la empresa,
 *                              incluido quien lo tiene asignado.
 * Administrador de Sucursal → todos EXCEPTO los 5 de gestión global
 *                              (sucursales.ver/gestionar, empresa.configurar,
 *                              auditoria.ver/exportar)
 *
 * Si la transacción falla (ej. permiso faltante en catálogo), se hace
 * rollback completo — la empresa queda creada pero sin roles,
 * y el error sube al service para que lo maneje.
 */
const crearRolesDefault = async ({ empresaId }) => {
  // Obtener todos los permisos activos del catálogo global
  const todosLosPermisos = await prisma.permisos.findMany({
    where:  { deleted_at: null },
    select: { id: true, clave: true },
  })

  if (todosLosPermisos.length === 0) {
    throw new Error('El catálogo de permisos está vacío — no se pueden crear roles por defecto')
  }

  const idsAdminGeneral = todosLosPermisos
    .filter((p) => !PERMISOS_EXCLUIDOS_ADMIN_GENERAL.includes(p.clave))
    .map((p) => p.id)

  const idsAdminSucursal = todosLosPermisos
    .filter((p) => !PERMISOS_EXCLUIDOS_ADMIN_SUCURSAL.includes(p.clave))
    .map((p) => p.id)

  return prisma.$transaction(async (tx) => {
    // 1. Crear rol Administrador General — PROTEGIDO: es_protegido: true lo
    //    hace invisible/inmutable para cualquier consulta de esta empresa vía
    //    la API de roles (ver roles.repository.listar()/buscarPorId()).
    //    Ni siquiera quien lo tiene asignado puede verlo o editarlo desde el
    //    frontend — solo el equipo MERCI, fuera de esta API.
    const rolGeneral = await tx.catalogo_roles.create({
      data: {
        empresa_id:   empresaId,
        nombre:       'Administrador General',
        descripcion:  'Acceso total a la empresa incluyendo gestión de sucursales',
        es_global:    false,
        es_protegido: true,
        color:        COLOR_ADMIN_GENERAL,
      },
      select: { id: true, nombre: true },
    })

    // 2. Crear rol Administrador de Sucursal
    const rolSucursal = await tx.catalogo_roles.create({
      data: {
        empresa_id:  empresaId,
        nombre:      'Administrador de Sucursal',
        descripcion: 'Acceso completo a su sucursal, sin gestión global de empresa',
        es_global:   false,
        color:       COLOR_ADMIN_SUCURSAL,
      },
      select: { id: true, nombre: true },
    })

    // 3. Asignar todos los permisos al Administrador General
    await tx.roles_permisos.createMany({
      data: idsAdminGeneral.map((permisoId) => ({
        rol_id:     rolGeneral.id,
        permiso_id: permisoId,
      })),
    })

    // 4. Asignar permisos filtrados al Administrador de Sucursal
    await tx.roles_permisos.createMany({
      data: idsAdminSucursal.map((permisoId) => ({
        rol_id:     rolSucursal.id,
        permiso_id: permisoId,
      })),
    })

    return {
      rolGeneralId:  rolGeneral.id,
      rolSucursalId: rolSucursal.id,
    }
  })
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorCodigo,
  crear,
  editar,
  eliminar,
  cambiarStatus,
  crearRolesDefault, // ← NUEVO
}