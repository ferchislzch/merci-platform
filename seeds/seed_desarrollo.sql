-- ════════════════════════════════════════════════════════════════════════════
-- MERCI — SEEDS DE DESARROLLO / QA  (⚠️ SOLO PARA DESARROLLO)
-- v5 | Julio 2026
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️  ADVERTENCIA DE SEGURIDAD:
--   Este archivo crea empresas y usuarios FICTICIOS con la contraseña de prueba
--   conocida 'Admin123!'. NO EJECUTAR EN PRODUCCIÓN. En producción los usuarios
--   deben crearse con contraseñas propias, nunca con este seed.
--
-- PRERREQUISITO:
--   Ejecutar PRIMERO db/merci_schema.sql. Estos INSERT dependen de que los
--   catálogos del sistema (catalogo_estado_usuario, permisos, etc.) ya existan.
--
-- Empresas de prueba: Hotel Paraíso (HTL-001) y Restaurante El Fogón (ELF-2024)
-- Credenciales de prueba: adminfogon / Admin123! / ELF-2024  (entre otras)
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 19: SEED — HOTEL PARAÍSO (tenant de desarrollo / QA)   (v4)
-- ════════════════════════════════════════════════════════════════════════════════
-- Crea la empresa Hotel Paraíso, sus roles locales, el usuario Administrador General
-- y asigna permisos. Este bloque REEMPLAZA al antiguo Bloque 19 (v3), que asumía que
-- la empresa y sus roles ya existían; aquí se crean desde cero.
--   • Administrador de Empresa  → TODOS los permisos (59)
--   • Administrador de Sucursal → TODOS excepto 4 globales (55)
-- ON CONFLICT DO NOTHING en los grants permite re-ejecutar la sección de permisos
-- sin duplicar (los INSERT de empresa/usuario sí fallarían en una segunda corrida:
-- este script está pensado para un entorno vacío).

-- Paso 1: Empresa
INSERT INTO empresas (nombre_comercial, razon_social, rfc, telefono, correo, codigo_acceso, status)
VALUES (
  'Hotel Paraíso',
  'Hotel Paraíso S.A. de C.V.',
  'HPA123456789',
  '3312345678',
  'contacto@hotelparaiso.com',
  'HTL-001',
  'activo'
);

-- Paso 2: Roles locales — Administrador de Empresa y Administrador de Sucursal
INSERT INTO catalogo_roles (empresa_id, nombre, descripcion, es_global)
SELECT id, 'Administrador de Empresa',
       'Acceso total a la empresa incluyendo gestión de sucursales', false
FROM empresas WHERE nombre_comercial = 'Hotel Paraíso';

INSERT INTO catalogo_roles (empresa_id, nombre, descripcion, es_global)
SELECT id, 'Administrador de Sucursal',
       'Acceso completo a su sucursal, sin gestión global de empresa', false
FROM empresas WHERE nombre_comercial = 'Hotel Paraíso';

-- Paso 3: Usuario Administrador General (sucursal_id NULL = ve toda la empresa)
INSERT INTO usuarios (empresa_id, nombre, usuario, correo, password_hash, estado_usuario_id, sucursal_id)
SELECT
  e.id,
  'Administrador Hotel',
  'adminhotel',
  'admin@hotelparaiso.com',
  crypt('Admin123!', gen_salt('bf')),
  eu.id,
  NULL   -- null = Admin General, ve toda la empresa
FROM empresas e
CROSS JOIN catalogo_estado_usuario eu
WHERE e.nombre_comercial = 'Hotel Paraíso'
  AND eu.nombre = 'Activo';

-- Paso 4: Asignación de rol al Admin General
INSERT INTO usuario_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
JOIN empresas e       ON u.empresa_id = e.id
JOIN catalogo_roles r ON r.empresa_id = e.id
WHERE e.nombre_comercial = 'Hotel Paraíso'
  AND u.usuario = 'adminhotel'
  AND r.nombre  = 'Administrador de Empresa';

-- Paso 5: Permisos — Administrador de Empresa (TODOS, incluye sucursales.gestionar)
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM catalogo_roles r
JOIN empresas e ON r.empresa_id = e.id
CROSS JOIN permisos p
WHERE e.nombre_comercial = 'Hotel Paraíso'
  AND r.nombre = 'Administrador de Empresa'
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Paso 6: Permisos — Administrador de Sucursal (TODOS excepto los 4 globales)
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM catalogo_roles r
JOIN empresas e ON r.empresa_id = e.id
CROSS JOIN permisos p
WHERE e.nombre_comercial = 'Hotel Paraíso'
  AND r.nombre = 'Administrador de Sucursal'
  AND p.clave NOT IN (
    'sucursales.gestionar',
    'empresa.configurar',
    'auditoria.ver',
    'auditoria.exportar'
  )
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Paso 7: Verificación
-- Esperado (catálogo v5 = 62 permisos):
--   Administrador de Empresa   → 62
--   Administrador de Sucursal  → 58  (62 - 4 excluidos; incluye departamentos.* y PBX)
SELECT r.nombre AS rol, COUNT(rp.permiso_id) AS total_permisos
FROM catalogo_roles r
JOIN empresas e ON r.empresa_id = e.id
LEFT JOIN roles_permisos rp ON rp.rol_id = r.id
WHERE e.nombre_comercial = 'Hotel Paraíso'
GROUP BY r.nombre
ORDER BY r.nombre;


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 20: SEED — RESTAURANTE EL FOGÓN (segunda empresa de prueba)   (v4)
-- ════════════════════════════════════════════════════════════════════════════════
-- Cadena con 2 sucursales. Demuestra: scoping por sucursal, Admin General vs
-- Admin Sucursal. Depende únicamente del esquema + catálogo de permisos (Bloque 3);
-- no requiere datos de Hotel Paraíso.

-- 1. EMPRESA
INSERT INTO empresas (nombre_comercial, razon_social, rfc, telefono, correo, codigo_acceso, status)
VALUES (
  'Restaurante El Fogón',
  'El Fogón Gourmet S.A. de C.V.',
  'EFG987654321',
  '3398765432',
  'contacto@elfogon.com',
  'ELF-2024',
  'activo'
);

-- 2. SUCURSALES
INSERT INTO sucursales (empresa_id, nombre, direccion, telefono, correo)
SELECT id, 'Sucursal Centro',  'Av. Juárez 100, Centro',      '3312340001', 'centro@elfogon.com'
FROM empresas WHERE nombre_comercial = 'Restaurante El Fogón';

INSERT INTO sucursales (empresa_id, nombre, direccion, telefono, correo)
SELECT id, 'Sucursal Norte',   'Blvd. Aviación 200, Zapopan', '3312340002', 'norte@elfogon.com'
FROM empresas WHERE nombre_comercial = 'Restaurante El Fogón';

-- 3. ROLES LOCALES
INSERT INTO catalogo_roles (empresa_id, nombre, descripcion, es_global)
SELECT id, 'Administrador General',
       'Acceso total a la empresa incluyendo gestión de sucursales', false
FROM empresas WHERE nombre_comercial = 'Restaurante El Fogón';

INSERT INTO catalogo_roles (empresa_id, nombre, descripcion, es_global)
SELECT id, 'Administrador de Sucursal',
       'Acceso completo a su sucursal, sin gestión global de empresa', false
FROM empresas WHERE nombre_comercial = 'Restaurante El Fogón';

-- 4. USUARIOS
-- adminfogon    → Admin General (sucursal_id = NULL, ve toda la empresa)
-- admin_centro  → Admin Sucursal Centro
-- admin_norte   → Admin Sucursal Norte
-- agente_centro → Usuario operativo Sucursal Centro

-- Admin General (sin sucursal)
INSERT INTO usuarios (empresa_id, sucursal_id, nombre, usuario, correo, password_hash, estado_usuario_id)
SELECT
  e.id, NULL,
  'Admin General Fogón', 'adminfogon', 'admin@elfogon.com',
  crypt('Admin123!', gen_salt('bf')), eu.id
FROM empresas e
CROSS JOIN catalogo_estado_usuario eu
WHERE e.nombre_comercial = 'Restaurante El Fogón' AND eu.nombre = 'Activo';

-- Admin Sucursal Centro
INSERT INTO usuarios (empresa_id, sucursal_id, nombre, usuario, correo, password_hash, estado_usuario_id)
SELECT
  e.id, s.id,
  'Admin Sucursal Centro', 'admin_centro', 'centro.admin@elfogon.com',
  crypt('Admin123!', gen_salt('bf')), eu.id
FROM empresas e
JOIN sucursales s ON s.empresa_id = e.id AND s.nombre = 'Sucursal Centro'
CROSS JOIN catalogo_estado_usuario eu
WHERE e.nombre_comercial = 'Restaurante El Fogón' AND eu.nombre = 'Activo';

-- Admin Sucursal Norte
INSERT INTO usuarios (empresa_id, sucursal_id, nombre, usuario, correo, password_hash, estado_usuario_id)
SELECT
  e.id, s.id,
  'Admin Sucursal Norte', 'admin_norte', 'norte.admin@elfogon.com',
  crypt('Admin123!', gen_salt('bf')), eu.id
FROM empresas e
JOIN sucursales s ON s.empresa_id = e.id AND s.nombre = 'Sucursal Norte'
CROSS JOIN catalogo_estado_usuario eu
WHERE e.nombre_comercial = 'Restaurante El Fogón' AND eu.nombre = 'Activo';

-- Agente operativo Sucursal Centro (rol limitado — solo permisos básicos)
INSERT INTO usuarios (empresa_id, sucursal_id, nombre, usuario, correo, password_hash, estado_usuario_id)
SELECT
  e.id, s.id,
  'Carlos Mendoza', 'cmendoza', 'cmendoza@elfogon.com',
  crypt('Admin123!', gen_salt('bf')), eu.id
FROM empresas e
JOIN sucursales s ON s.empresa_id = e.id AND s.nombre = 'Sucursal Centro'
CROSS JOIN catalogo_estado_usuario eu
WHERE e.nombre_comercial = 'Restaurante El Fogón' AND eu.nombre = 'Activo';

-- 5. ASIGNACIÓN DE ROLES A USUARIOS

-- adminfogon → Administrador General
INSERT INTO usuario_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
JOIN empresas e       ON u.empresa_id = e.id
JOIN catalogo_roles r ON r.empresa_id = e.id
WHERE e.nombre_comercial = 'Restaurante El Fogón'
  AND u.usuario = 'adminfogon'
  AND r.nombre  = 'Administrador General';

-- admin_centro → Administrador de Sucursal
INSERT INTO usuario_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
JOIN empresas e       ON u.empresa_id = e.id
JOIN catalogo_roles r ON r.empresa_id = e.id
WHERE e.nombre_comercial = 'Restaurante El Fogón'
  AND u.usuario = 'admin_centro'
  AND r.nombre  = 'Administrador de Sucursal';

-- admin_norte → Administrador de Sucursal
INSERT INTO usuario_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
JOIN empresas e       ON u.empresa_id = e.id
JOIN catalogo_roles r ON r.empresa_id = e.id
WHERE e.nombre_comercial = 'Restaurante El Fogón'
  AND u.usuario = 'admin_norte'
  AND r.nombre  = 'Administrador de Sucursal';

-- cmendoza → Administrador de Sucursal (o crear un rol Agente si se prefiere)
INSERT INTO usuario_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
JOIN empresas e       ON u.empresa_id = e.id
JOIN catalogo_roles r ON r.empresa_id = e.id
WHERE e.nombre_comercial = 'Restaurante El Fogón'
  AND u.usuario = 'cmendoza'
  AND r.nombre  = 'Administrador de Sucursal';

-- 6. PERMISOS — Administrador General (todos)
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM catalogo_roles r
JOIN empresas e ON r.empresa_id = e.id
CROSS JOIN permisos p
WHERE e.nombre_comercial = 'Restaurante El Fogón'
  AND r.nombre = 'Administrador General'
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 7. PERMISOS — Administrador de Sucursal (sin los 4 globales)
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM catalogo_roles r
JOIN empresas e ON r.empresa_id = e.id
CROSS JOIN permisos p
WHERE e.nombre_comercial = 'Restaurante El Fogón'
  AND r.nombre = 'Administrador de Sucursal'
  AND p.clave NOT IN (
    'sucursales.gestionar',
    'empresa.configurar',
    'auditoria.ver',
    'auditoria.exportar'
  )
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 8. VERIFICACIÓN
SELECT
  u.usuario,
  e.codigo_acceso,
  COALESCE(s.nombre, 'Admin General (toda la empresa)') AS sucursal,
  r.nombre           AS rol,
  COUNT(rp.permiso_id) AS permisos
FROM usuarios u
JOIN empresas              e  ON u.empresa_id       = e.id
JOIN catalogo_estado_usuario eu ON u.estado_usuario_id = eu.id
LEFT JOIN sucursales       s  ON u.sucursal_id      = s.id
JOIN usuario_roles         ur ON ur.usuario_id      = u.id
JOIN catalogo_roles        r  ON r.id               = ur.rol_id
LEFT JOIN roles_permisos   rp ON rp.rol_id          = r.id
WHERE e.nombre_comercial = 'Restaurante El Fogón'
GROUP BY u.usuario, e.codigo_acceso, s.nombre, r.nombre
ORDER BY u.usuario;

-- Esperado (catálogo v5 = 62 permisos):
-- admin_centro  | ELF-2024 | Sucursal Centro                | Administrador de Sucursal | 58
-- admin_norte   | ELF-2024 | Sucursal Norte                 | Administrador de Sucursal | 58
-- adminfogon    | ELF-2024 | Admin General (toda la empresa)| Administrador General     | 62
-- cmendoza      | ELF-2024 | Sucursal Centro                | Administrador de Sucursal | 58