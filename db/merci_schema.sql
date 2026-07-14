-- ════════════════════════════════════════════════════════════════════════════
-- MERCI — ESQUEMA DE BASE DE DATOS (SOLO ESTRUCTURA)
-- v5 | Julio 2026
-- ════════════════════════════════════════════════════════════════════════════
-- Contiene: extensiones, 62 tablas, catálogos del sistema (estados, tipos,
--   62 permisos, roles globales), funciones, triggers, vistas e índices.
--
-- NO contiene datos de prueba. Los seeds de desarrollo (empresas y usuarios
--   ficticios) están en:  db/seeds/seed_desarrollo.sql
--
-- INSTALACIÓN:
--   Producción  → ejecutar SOLO este archivo.
--   Desarrollo  → ejecutar este archivo y LUEGO db/seeds/seed_desarrollo.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════
-- MERCI
-- BASE DE DATOS COMPLETA — SCRIPT ÚNICO DESDE CERO
-- Plataforma SaaS multiempresa | Integración IA + SIP vía CloudUCM API REST
-- Módulos activos: N01 al N13, N15 al N17 | N14, N18 y N19 DESCARTADOS
-- ────────────────────────────────────────────────────────────────────────────────
-- HISTORIAL DE CAMBIOS:
--   v1 — Script base con correcciones 1-8 (ver detalle abajo)
--   v2 — Integración de migraciones Bina 1:
--          • pgcrypto añadido al bloque de extensiones
--          • intentos_login (tabla 62) añadida en Bloque 3 tras sesiones
--          • codigo_acceso añadida directamente en CREATE TABLE empresas
--          • uq_empresas_codigo_acceso añadido en Bloque 18
--          • idx_intentos_usuario_fecha añadido en Bloque 17
--   v3 — Integración de migración Sucursales + permisos completos:
--          • sucursal_id añadida a usuarios (columna + FK diferida + índice)
--          • FK fk_usuarios_sucursal registrada después de CREATE TABLE sucursales
--          • Permisos sucursales.ver y sucursales.gestionar añadidos al INSERT de permisos
--          • Bloque 19: seed data Hotel Paraíso (roles_permisos, rol Administrador de Sucursal)
--          • Bloque 19: consulta de verificación al final
--   v5 — Integración de Binas 3 y 4 (Julio 2026):
--          • Permisos PBX de Bina 3 (modulo 'Telefonía'): extensiones.sync,
--            configuracion_pbx.ver, configuracion_pbx.gestionar.
--            → El catálogo pasa de 59 a 62 permisos.
--          • Campos de IA de Bina 4 en 'llamadas' (respuesta_ia, llm_estado,
--            tts_estado) y en 'auditorias_comandos_ia' (respuesta_ia_puro).
--          • Conteos de verificación actualizados: Admin de Empresa/General = 62,
--            Administrador de Sucursal = 58 (62 - 4 globales).
--
--   v4 — Consolidación de modificaciones (Junio 2026):
--          • Permisos departamentos.ver y departamentos.gestionar añadidos al INSERT
--            de permisos (Bloque 3), módulo 'Seguridad' — junto a sucursales.*
--            (la migración original los ponía en 'Administración'; ver nota más abajo)
--          • Bloque 19 REESCRITO: ahora es el seed real de Hotel Paraíso — crea la
--            empresa, roles locales, usuario adminhotel y asigna permisos. El antiguo
--            Bloque 19 asumía que la empresa ya existía y quedó superado.
--          • Bloque 20 AÑADIDO: seed de Restaurante El Fogón (2 sucursales, 4 usuarios).
--          • Conteos de verificación corregidos en TODO el script:
--                rol con todos los permisos          = 59
--                rol "Administrador de Sucursal"     = 55  (59 - 4 excluidos)
--          • Apéndice A: migración de departamentos como parche OPCIONAL para BD ya
--            desplegadas. Corrige el bug de nombre de rol de la migración original
--            ('Administrador Sucursal' → 'Administrador de Sucursal').
--
-- CORRECCIONES v1:
--   1. catalogo_tipo_evento: punto y coma incorrecto entre filas del INSERT corregido.
--      dashboard_update y agent_status_changed se insertan correctamente.
--   2. catalogo_proveedores_ia: comentario --TSS corregido a --TTS.
--   3. jobs_async: agregados worker_id VARCHAR(100) y locked_at TIMESTAMP
--      para el patrón SELECT FOR UPDATE SKIP LOCKED.
--   4. Bloque 15: fn_desactivar_sesiones_anteriores() y trigger añadidos.
--   5. Bloque 15: conteo corregido a 10 funciones | 12 triggers.
--   6. Bloque 17: idx_jobs_pendientes_lock e idx_jobs_worker añadidos.
--   7. chk_acia_status: 'éxito' → 'exitoso' (solo ASCII).
--   8. grupos_atencion: índice único uq_grupo_empresa_clave añadido.
-- ────────────────────────────────────────────────────────────────────────────────
-- NOTA DE VERIFICACIÓN (v4) — inconsistencias detectadas y resueltas:
--   A. La migración "Permisos de Departamentos" usaba el nombre de rol
--      'Administrador Sucursal' (sin "de"), pero TODOS los seeds crean el rol como
--      'Administrador de Sucursal'. Tal cual, la migración habría asignado 0 permisos.
--      → Aquí los permisos se integran directamente en el catálogo (Bloque 3), por lo
--        que el seed "todos excepto 4" ya los asigna al rol de sucursal sin depender
--        del nombre. El parche del Apéndice A queda con el nombre corregido.
--   B. Los comentarios "-- Esperado" de los distintos fragmentos traían conteos viejos
--      (56/52/57). El catálogo real ahora es 59 → se recalcularon a 59/55.
--   C. El antiguo Bloque 19 se solapaba con el seed de Hotel Paraíso (ambos tocaban
--      los mismos roles). Se unificaron en un solo Bloque 19 auto-contenido.
-- ────────────────────────────────────────────────────────────────────────────────
-- ORDEN DE EJECUCIÓN: correr este script completo de una sola vez EN UN ENTORNO VACÍO
-- ════════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────────
-- BLOQUE 0: EXTENSIONES DEL SISTEMA
-- ────────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- Bina 1: hashing de contraseñas con crypt()


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1: CATÁLOGOS GLOBALES
-- ════════════════════════════════════════════════════════════════════════════════
-- Soft delete unificado con deleted_at (NULL = activo)
-- 13 tablas de catálogo: valores fijos que parametrizan el sistema
-- No se modifican en operación normal; solo el Super Administrador las extiende

-- 1
CREATE TABLE catalogo_estado_usuario (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(50) NOT NULL,
    deleted_at TIMESTAMP NULL
);
INSERT INTO catalogo_estado_usuario (nombre) VALUES
    ('Activo'), ('Inactivo'), ('Suspendido'), ('Bloqueado');

-- 2
CREATE TABLE catalogo_estado_agente (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(50) NOT NULL,
    deleted_at TIMESTAMP NULL
);
INSERT INTO catalogo_estado_agente (nombre) VALUES
    ('Disponible'), ('Ocupado'), ('Pausado'),
    ('Fuera de Servicio'), ('Entrenamiento'), ('Mantenimiento'), ('Desconectado');

-- 3
CREATE TABLE catalogo_estado_extension (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(50) NOT NULL,
    deleted_at TIMESTAMP NULL
);
INSERT INTO catalogo_estado_extension (nombre) VALUES
    ('Activa'), ('Ocupada'), ('En Llamada'),
    ('Suspendida'), ('Desconectada'), ('No Disponible');

-- 4
CREATE TABLE catalogo_tipo_visibilidad (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre      VARCHAR(50) NOT NULL,
    descripcion TEXT,
    deleted_at  TIMESTAMP NULL
);
INSERT INTO catalogo_tipo_visibilidad (nombre, descripcion) VALUES
    ('Visible',        'Visible para todos los usuarios'),
    ('Privado',        'Solo visible para el propietario'),
    ('Oculto',         'No visible en directorios'),
    ('Solo Interno',   'Solo visible dentro de la empresa'),
    ('Administrativo', 'Solo visible para administradores');

-- 5
CREATE TABLE catalogo_sentimientos (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(50) NOT NULL,
    deleted_at TIMESTAMP NULL
);
INSERT INTO catalogo_sentimientos (nombre) VALUES
    ('Positivo'), ('Neutral'), ('Negativo'), ('Molesto');

-- 6
CREATE TABLE catalogo_estado_llamada (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(50) NOT NULL,
    deleted_at TIMESTAMP NULL
);
INSERT INTO catalogo_estado_llamada (nombre) VALUES
    ('En Espera'), ('En Proceso'), ('Finalizada'),
    ('Cancelada'), ('Transferida'), ('Perdida'), ('Escalada');

-- 7
CREATE TABLE catalogo_resultado_llamada (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(50) NOT NULL,
    deleted_at TIMESTAMP NULL
);
INSERT INTO catalogo_resultado_llamada (nombre) VALUES
    ('Exitosa'), ('Sin Respuesta'), ('Transferida'),
    ('Escalada a Humano'), ('Buzón de Voz'),
    ('Cancelada por Usuario'), ('Error de Comunicación');

-- 8
CREATE TABLE catalogo_estado_ticket (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre      VARCHAR(50) NOT NULL,
    descripcion TEXT,
    deleted_at  TIMESTAMP NULL
);
INSERT INTO catalogo_estado_ticket (nombre, descripcion) VALUES
    ('Abierto',    'Ticket recién generado'),
    ('En Proceso', 'Ticket siendo atendido'),
    ('Pendiente',  'Esperando información adicional'),
    ('Resuelto',   'Problema solucionado'),
    ('Cerrado',    'Ticket finalizado'),
    ('Cancelado',  'Ticket invalidado o descartado');

-- 9
CREATE TABLE catalogo_prioridad_ticket (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre      VARCHAR(50) NOT NULL,
    descripcion TEXT,
    deleted_at  TIMESTAMP NULL
);
INSERT INTO catalogo_prioridad_ticket (nombre, descripcion) VALUES
    ('Baja',    'Incidencia menor'),
    ('Media',   'Atención normal'),
    ('Alta',    'Requiere atención rápida'),
    ('Crítica', 'Impacto severo al negocio');

-- 10
CREATE TABLE catalogo_estado_workflow (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre      VARCHAR(50) NOT NULL,
    descripcion TEXT,
    deleted_at  TIMESTAMP NULL
);
INSERT INTO catalogo_estado_workflow (nombre, descripcion) VALUES
    ('Activo',        'Workflow ejecutándose normalmente'),
    ('Pausado',       'Workflow temporalmente detenido'),
    ('Deshabilitado', 'Workflow fuera de operación');

-- 11
CREATE TABLE catalogo_tipo_documento_ia (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre      VARCHAR(50) NOT NULL,
    descripcion TEXT,
    deleted_at  TIMESTAMP NULL
);
INSERT INTO catalogo_tipo_documento_ia (nombre, descripcion) VALUES
    ('Políticas',      'Documentos de políticas internas'),
    ('Productos',      'Información comercial de productos'),
    ('Procedimientos', 'Manuales operativos'),
    ('FAQ',            'Preguntas frecuentes'),
    ('Horarios',       'Horarios de sucursales o atención');

-- 12
CREATE TABLE catalogo_tipo_evento (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clave       VARCHAR(50) UNIQUE NOT NULL,
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT,
    deleted_at  TIMESTAMP NULL
);
INSERT INTO catalogo_tipo_evento (clave, nombre) VALUES
    ('call_started',         'Llamada iniciada'),
    ('call_ended',           'Llamada finalizada'),
    ('call_transferred',     'Llamada transferida'),
    ('ticket_created',       'Ticket creado'),
    ('ticket_updated',       'Ticket actualizado'),
    ('agent_online',         'Agente en línea'),
    ('agent_offline',        'Agente desconectado'),
    ('pbx_disconnected',     'PBX desconectado'),
    ('workflow_triggered',   'Workflow ejecutado'),
    ('stt_completed',        'Transcripción completada'),
    ('stt_error',            'Error en transcripción'),
    ('dashboard_update',     'Métricas actualizadas'),
    ('agent_status_changed', 'Estado de agente cambiado');

-- 13
CREATE TABLE catalogo_proveedores_ia (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre     VARCHAR(100) NOT NULL,
    tipo       VARCHAR(20) NOT NULL,  -- stt | tts | llm
    deleted_at TIMESTAMP NULL,
    CONSTRAINT chk_proveedor_ia_tipo CHECK (tipo IN ('stt', 'tts', 'llm'))
);
INSERT INTO catalogo_proveedores_ia (nombre, tipo) VALUES
    -- LLM
    ('OpenAI GPT-4o',          'llm'),
    ('Google Gemini',          'llm'),
    -- STT
    ('OpenAI Whisper',         'stt'),
    ('Google Speech-to-Text',  'stt'),
    -- TTS
    ('OpenAI TTS',             'tts'),
    ('ElevenLabs',             'tts');


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2: EMPRESAS Y CONFIGURACIÓN
-- ════════════════════════════════════════════════════════════════════════════════
-- 5 tablas: empresas, configuraciones_empresa, configuraciones_pbx,
--           sincronizaciones_pbx, pbx_eventos_raw
-- Bina 1: codigo_acceso añadido directamente en la definición de empresas
--         (reemplaza el autocomplete en el flujo de login)

-- 14
CREATE TABLE empresas (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_comercial    VARCHAR(100) NOT NULL,
    razon_social        VARCHAR(150),
    rfc                 VARCHAR(13),
    telefono            VARCHAR(20),
    correo              CITEXT,
    codigo_acceso       VARCHAR(20),               -- Bina 1: identificador corto para login
    status              VARCHAR(20) DEFAULT 'activo',
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_status_empresa
        CHECK (status IN ('activo', 'suspendido', 'cancelado'))
);

COMMENT ON TABLE empresas IS
'Tenant principal. Cada empresa opera en espacio de datos completamente aislado.';
COMMENT ON COLUMN empresas.codigo_acceso IS
'Código corto que el usuario ingresa en el login para seleccionar empresa. Único entre empresas activas (índice parcial uq_empresas_codigo_acceso).';

-- 15
CREATE TABLE configuraciones_empresa (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL UNIQUE,
    voz_ia              VARCHAR(50),
    idioma              VARCHAR(10) DEFAULT 'es',
    timeout_seg         INT DEFAULT 30,
    proveedor_stt_id    UUID,
    proveedor_tts_id    UUID,
    proveedor_llm_id    UUID,
    credenciales_ia     JSONB,
    modelo_ia           VARCHAR(50) DEFAULT 'gpt-4o',
    temperatura_modelo  DECIMAL(3,2) DEFAULT 0.7,
    metadata            JSONB,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ce_empresa FOREIGN KEY (empresa_id)       REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_ce_stt     FOREIGN KEY (proveedor_stt_id) REFERENCES catalogo_proveedores_ia(id) ON DELETE SET NULL,
    CONSTRAINT fk_ce_tts     FOREIGN KEY (proveedor_tts_id) REFERENCES catalogo_proveedores_ia(id) ON DELETE SET NULL,
    CONSTRAINT fk_ce_llm     FOREIGN KEY (proveedor_llm_id) REFERENCES catalogo_proveedores_ia(id) ON DELETE SET NULL,
    CONSTRAINT chk_temperatura_valida CHECK (temperatura_modelo BETWEEN 0 AND 1)
);

-- 16
CREATE TABLE configuraciones_pbx (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    proveedor           VARCHAR(50) NOT NULL DEFAULT 'grandstream',
    api_url             TEXT NOT NULL,
    api_usuario         VARCHAR(100) NOT NULL,
    auth_tipo           VARCHAR(30) DEFAULT 'md5_token',
    credenciales        JSONB NOT NULL,
    activo              BOOLEAN DEFAULT true,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pbx_empresa    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT chk_proveedor_pbx CHECK (proveedor IN ('grandstream', 'cisco', 'asterisk', 'freepbx', 'otro'))
);

-- 17
CREATE TABLE sincronizaciones_pbx (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID NOT NULL,
    pbx_id      UUID,
    endpoint    VARCHAR(200),
    status      VARCHAR(20) NOT NULL,
    duracion_ms INT,
    errores     JSONB,
    fecha_sync  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sync_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_sync_pbx    FOREIGN KEY (pbx_id)     REFERENCES configuraciones_pbx(id) ON DELETE SET NULL,
    CONSTRAINT chk_sync_status CHECK (status IN ('exitosa', 'error', 'parcial'))
);

-- 18
CREATE TABLE pbx_eventos_raw (
    id         BIGSERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL,
    pbx_id     UUID,
    tipo       VARCHAR(50),
    headers    JSONB,
    payload    JSONB NOT NULL,
    procesado  BOOLEAN DEFAULT false,
    fecha      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pbxraw_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_pbxraw_pbx     FOREIGN KEY (pbx_id)     REFERENCES configuraciones_pbx(id) ON DELETE SET NULL
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 3: USUARIOS, ROLES Y PERMISOS (N01, N05, N06)
-- ════════════════════════════════════════════════════════════════════════════════
-- 7 tablas: usuarios, sesiones, intentos_login, catalogo_roles, usuario_roles,
--           permisos, roles_permisos
-- Modelo RBAC estándar. Los roles pueden ser globales (empresa_id NULL,
-- solo Super Administrador y Auditor Global) o locales por empresa.
-- Bina 1: intentos_login (tabla 62) añadida para rate-limiting en auth.
-- v3: sucursal_id añadida a usuarios; FK diferida hasta después de CREATE TABLE sucursales
-- v4: permisos departamentos.ver / departamentos.gestionar añadidos al INSERT de permisos

-- 19
CREATE TABLE usuarios (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    usuario             VARCHAR(50) NOT NULL,
    correo              CITEXT NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    telefono_2fa        VARCHAR(20),
    sucursal_id         UUID NULL,                 -- v3: asignación de sucursal; FK añadida tras CREATE TABLE sucursales
    estado_usuario_id   UUID,
    ultimo_acceso       TIMESTAMP,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_id)        REFERENCES empresas(id)              ON DELETE CASCADE,
    CONSTRAINT fk_usuarios_estado  FOREIGN KEY (estado_usuario_id) REFERENCES catalogo_estado_usuario(id) ON DELETE SET NULL
);

-- 20
CREATE TABLE sesiones (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id       UUID NOT NULL,
    token_hash       VARCHAR(255) NOT NULL,
    ip               VARCHAR(45),
    dispositivo      TEXT,
    activo           BOOLEAN DEFAULT true,
    fecha_inicio     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion TIMESTAMP,
    CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT chk_sesion_fechas   CHECK (fecha_expiracion IS NULL OR fecha_expiracion > fecha_inicio)
);

-- 62  (Bina 1)
-- intentos_login: registro por intento fallido para rate-limiting en el middleware de auth.
-- El controller de login inserta una fila por cada intento fallido; consulta cuántos
-- hubo en los últimos N minutos antes de permitir el siguiente intento.
CREATE TABLE intentos_login (
    id         BIGSERIAL PRIMARY KEY,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL,
    ip         VARCHAR(45),
    fecha      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 21
CREATE TABLE catalogo_roles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID,
    nombre              VARCHAR(50) NOT NULL,
    descripcion         TEXT,
    es_global           BOOLEAN DEFAULT false,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_roles_empresa       FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT chk_rol_global_empresa CHECK (
        (es_global = true  AND empresa_id IS NULL) OR
        (es_global = false AND empresa_id IS NOT NULL)
    )
);

INSERT INTO catalogo_roles (nombre, descripcion, es_global, deleted_at) VALUES
    ('Super Administrador', 'Acceso total al sistema y configuración global', true, NULL),
    ('Auditor Global',      'Auditoría y verificación en todas las empresas', true, NULL);

-- 22
CREATE TABLE usuario_roles (
    usuario_id     UUID NOT NULL,
    rol_id         UUID NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, rol_id),
    CONSTRAINT fk_ur_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)       ON DELETE CASCADE,
    CONSTRAINT fk_ur_rol     FOREIGN KEY (rol_id)     REFERENCES catalogo_roles(id) ON DELETE CASCADE
);

-- 23
CREATE TABLE permisos (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clave          VARCHAR(100) UNIQUE NOT NULL,
    nombre         VARCHAR(100) NOT NULL,
    descripcion    TEXT,
    modulo         VARCHAR(50),
    deleted_at     TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO permisos (clave, nombre, descripcion, modulo) VALUES

-- Módulo Seguridad (N01, N05, N06)
('usuarios.ver',        'Ver Usuarios',        'Consultar lista de usuarios de la empresa', 'Seguridad'),
('usuarios.crear',      'Crear Usuarios',      'Registrar nuevos usuarios en el sistema',   'Seguridad'),
('usuarios.editar',     'Editar Usuarios',     'Modificar datos de usuarios existentes',    'Seguridad'),
('usuarios.eliminar',   'Eliminar Usuarios',   'Eliminar usuarios (soft delete)',           'Seguridad'),
('usuarios.roles',      'Gestionar Roles',     'Asignar o quitar roles a usuarios',         'Seguridad'),
('roles.ver',           'Ver Roles',           'Consultar roles disponibles',               'Seguridad'),
('roles.crear',         'Crear Roles',         'Crear nuevos roles personalizados',         'Seguridad'),
('roles.editar',        'Editar Roles',        'Modificar roles existentes',                'Seguridad'),
('roles.eliminar',      'Eliminar Roles',      'Eliminar roles',                            'Seguridad'),
('permisos.ver',        'Ver Permisos',        'Consultar permisos disponibles',            'Seguridad'),
('empresa.configurar',  'Configurar Empresa',  'Modificar configuración de la empresa',     'Seguridad'),
-- v3: permisos de sucursales
('sucursales.ver',       'Ver Sucursales',       'Consultar lista de sucursales de la empresa', 'Seguridad'),
('sucursales.gestionar', 'Gestionar Sucursales', 'Crear, editar y eliminar sucursales',         'Seguridad'),
-- v4: permisos de departamentos (integrados desde la migración de Departamentos).
--     NOTA: la migración original los etiquetaba en el módulo 'Administración'; aquí se
--     alinean con 'Seguridad' para agruparlos junto a sucursales.* en la UI de Roles.
--     Si tu frontend agrupa por 'Administración', cambia el módulo en estas dos líneas.
('departamentos.ver',       'Ver Departamentos',       'Consultar la lista de departamentos de la sucursal',   'Seguridad'),
('departamentos.gestionar', 'Gestionar Departamentos', 'Crear, editar y eliminar departamentos de la sucursal', 'Seguridad'),

-- Módulo Agentes Virtuales (N02, N10, N16)
('agentes.ver',         'Ver Agentes',         'Consultar lista de agentes virtuales',                  'IA'),
('agentes.crear',       'Crear Agentes',       'Crear nuevos agentes virtuales',                        'IA'),
('agentes.editar',      'Editar Agentes',      'Modificar configuración de agentes',                    'IA'),
('agentes.eliminar',    'Eliminar Agentes',    'Eliminar agentes virtuales',                            'IA'),
('agentes.estado',      'Cambiar Estado',      'Cambiar estado manual de agente (Disponible/Ocupado)',  'IA'),
('prompts.ver',         'Ver Prompts',         'Consultar versiones de prompt',                         'IA'),
('prompts.editar',      'Editar Prompts',      'Modificar prompts de agentes',                          'IA'),
('prompts.restaurar',   'Restaurar Prompts',   'Restaurar versiones anteriores de prompt',              'IA'),

-- Módulo Llamadas (N13, N14)
('llamadas.ver',        'Ver Llamadas',        'Consultar historial de llamadas',              'Llamadas'),
('llamadas.exportar',   'Exportar Llamadas',   'Exportar lista de llamadas a CSV/Excel',       'Llamadas'),
('llamadas.detalle',    'Ver Detalle',         'Ver detalles completos de una llamada',        'Llamadas'),
('llamadas.escuchar',   'Escuchar Grabación',  'Reproducir grabación de llamada',             'Llamadas'),
('llamadas.analisis',   'Ver Análisis IA',     'Ver análisis de sentimiento y clasificación',  'Llamadas'),

-- Módulo Dashboard y Reportes (N12)
('dashboard.ver',       'Ver Dashboard',       'Acceder al dashboard principal',           'Dashboard'),
('metricas.ver',        'Ver Métricas',        'Consultar métricas y KPIs',                'Dashboard'),
('reportes.ver',        'Ver Reportes',        'Consultar reportes generados',             'Dashboard'),
('reportes.exportar',   'Exportar Reportes',   'Exportar reportes a CSV/Excel/PDF',        'Dashboard'),

-- Módulo Tickets (N04)
('tickets.ver',         'Ver Tickets',         'Consultar lista de tickets',               'Tickets'),
('tickets.crear',       'Crear Tickets',       'Crear nuevos tickets manualmente',         'Tickets'),
('tickets.editar',      'Editar Tickets',      'Modificar tickets existentes',             'Tickets'),
('tickets.eliminar',    'Eliminar Tickets',    'Eliminar tickets',                         'Tickets'),
('tickets.asignar',     'Asignar Tickets',     'Asignar tickets a usuarios',               'Tickets'),
('tickets.comentar',    'Comentar Tickets',    'Agregar comentarios a tickets',            'Tickets'),

-- Módulo Extensiones (N17)
('extensiones.ver',     'Ver Extensiones',     'Consultar lista de extensiones',  'Telefonía'),
('extensiones.crear',   'Crear Extensiones',   'Crear nuevas extensiones',        'Telefonía'),
('extensiones.editar',  'Editar Extensiones',  'Modificar extensiones',           'Telefonía'),
('extensiones.eliminar','Eliminar Extensiones','Eliminar extensiones',             'Telefonía'),
-- Permisos de Bina 3 (Telefonía / PBX)
('extensiones.sync',            'Sincronizar Extensiones',     'Sincroniza extensiones desde la PBX', 'Telefonía'),
('configuracion_pbx.ver',       'Ver Configuración PBX',       'Consultar configuración PBX',         'Telefonía'),
('configuracion_pbx.gestionar', 'Gestionar Configuración PBX', 'Editar y probar la conexión PBX',     'Telefonía'),

-- Módulo Grupos de Atención (N11)
('grupos.ver',          'Ver Grupos',          'Consultar grupos de atención',    'Telefonía'),
('grupos.crear',        'Crear Grupos',        'Crear nuevos grupos de atención', 'Telefonía'),
('grupos.editar',       'Editar Grupos',       'Modificar grupos de atención',    'Telefonía'),
('grupos.eliminar',     'Eliminar Grupos',     'Eliminar grupos de atención',     'Telefonía'),

-- Módulo Workflows (N11)
('workflows.ver',       'Ver Workflows',       'Consultar workflows configurados', 'Workflows'),
('workflows.crear',     'Crear Workflows',     'Crear nuevos workflows',           'Workflows'),
('workflows.editar',    'Editar Workflows',    'Modificar workflows',              'Workflows'),
('workflows.eliminar',  'Eliminar Workflows',  'Eliminar workflows',               'Workflows'),
('workflows.activar',   'Activar Workflows',   'Activar o pausar workflows',       'Workflows'),

-- Módulo Base de Conocimiento (N09)
('documentos.ver',      'Ver Documentos',      'Consultar documentos IA',                          'Conocimiento'),
('documentos.crear',    'Crear Documentos',    'Agregar documentos a la base de conocimiento',     'Conocimiento'),
('documentos.editar',   'Editar Documentos',   'Modificar documentos',                             'Conocimiento'),
('documentos.eliminar', 'Eliminar Documentos', 'Eliminar documentos',                              'Conocimiento'),
('faq.ver',             'Ver FAQ',             'Consultar preguntas frecuentes',                   'Conocimiento'),
('faq.editar',          'Editar FAQ',          'Modificar preguntas frecuentes',                   'Conocimiento'),

-- Módulo Auditoría (N03) — Solo para Auditores
('auditoria.ver',       'Ver Auditoría',       'Consultar logs de auditoría', 'Auditoría'),
('auditoria.exportar',  'Exportar Auditoría',  'Exportar logs de auditoría',  'Auditoría');

-- 24
CREATE TABLE roles_permisos (
    rol_id         UUID NOT NULL,
    permiso_id     UUID NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (rol_id, permiso_id),
    CONSTRAINT fk_rp_rol     FOREIGN KEY (rol_id)     REFERENCES catalogo_roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permiso FOREIGN KEY (permiso_id) REFERENCES permisos(id)       ON DELETE CASCADE
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 4: ESTRUCTURA ORGANIZACIONAL (N17)
-- ════════════════════════════════════════════════════════════════════════════════
-- 3 tablas: sucursales, departamentos, puestos
-- Jerarquía: empresa → sucursal → departamento.
-- Los puestos son independientes por empresa y se asignan a extensiones

-- 25
CREATE TABLE sucursales (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    direccion           TEXT,
    telefono            VARCHAR(20),
    correo              CITEXT,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_suc_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- ALTER TABLE: completa FK usuarios → sucursales (v3)
-- sucursal_id declarada en CREATE TABLE usuarios sin FK; se completa aquí
-- porque sucursales se define después de usuarios.
ALTER TABLE usuarios
    ADD CONSTRAINT fk_usuarios_sucursal
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE SET NULL;

-- 26
CREATE TABLE departamentos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sucursal_id         UUID NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dep_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE
);

-- 27
CREATE TABLE puestos (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    nombre         VARCHAR(100) NOT NULL,
    deleted_at     TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_puestos_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 5: CALENDARIOS Y HORARIOS (N08, N17)
-- ════════════════════════════════════════════════════════════════════════════════
-- 3 tablas: calendarios, horarios, eventos_agenda

-- 28
CREATE TABLE calendarios (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         TEXT,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cal_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 29
CREATE TABLE horarios (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calendario_id  UUID NOT NULL,
    dia_semana     VARCHAR(10) NOT NULL,
    hora_inicio    TIME NOT NULL,
    hora_fin       TIME NOT NULL,
    deleted_at     TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hor_calendario FOREIGN KEY (calendario_id) REFERENCES calendarios(id) ON DELETE CASCADE,
    CONSTRAINT chk_horario_rango CHECK (hora_fin > hora_inicio)
);

-- 30
CREATE TABLE eventos_agenda (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID NOT NULL,
    usuario_id       UUID NOT NULL,
    titulo           VARCHAR(200) NOT NULL,
    descripcion      TEXT,
    fecha_inicio     TIMESTAMP NOT NULL,
    fecha_fin        TIMESTAMP,
    origen_ia        BOOLEAN DEFAULT false,
    google_event_id  VARCHAR(255),
    outlook_event_id VARCHAR(255),
    deleted_at       TIMESTAMP,
    fecha_registro   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_agenda_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_agenda_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT chk_agenda_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 6: EXTENSIONES Y DISPOSITIVOS
-- ════════════════════════════════════════════════════════════════════════════════
-- 3 tablas: listas_extensiones, extensiones, usuario_extensiones

-- 31
CREATE TABLE listas_extensiones (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    clave               VARCHAR(50) NOT NULL,
    descripcion         TEXT,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_le_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 32
CREATE TABLE extensiones (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    sucursal_id         UUID,
    lista_extension_id  UUID,
    extension           VARCHAR(10) NOT NULL,
    nombre              VARCHAR(100),
    puesto_id           UUID,
    departamento_id     UUID,
    correo              CITEXT,
    tipo_visibilidad_id UUID,
    estado_extension_id UUID,
    pbx_mac_address     VARCHAR(12),
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_mac_hex           CHECK (pbx_mac_address IS NULL OR pbx_mac_address ~ '^[A-Fa-f0-9]{12}$'),
    CONSTRAINT uq_empresa_extension  UNIQUE (empresa_id, extension),
    CONSTRAINT fk_ext_empresa        FOREIGN KEY (empresa_id)          REFERENCES empresas(id)                  ON DELETE CASCADE,
    CONSTRAINT fk_ext_sucursal       FOREIGN KEY (sucursal_id)         REFERENCES sucursales(id)                ON DELETE SET NULL,
    CONSTRAINT fk_ext_lista          FOREIGN KEY (lista_extension_id)  REFERENCES listas_extensiones(id)        ON DELETE SET NULL,
    CONSTRAINT fk_ext_puesto         FOREIGN KEY (puesto_id)           REFERENCES puestos(id)                   ON DELETE SET NULL,
    CONSTRAINT fk_ext_departamento   FOREIGN KEY (departamento_id)     REFERENCES departamentos(id)             ON DELETE SET NULL,
    CONSTRAINT fk_ext_visibilidad    FOREIGN KEY (tipo_visibilidad_id) REFERENCES catalogo_tipo_visibilidad(id) ON DELETE SET NULL,
    CONSTRAINT fk_ext_estado         FOREIGN KEY (estado_extension_id) REFERENCES catalogo_estado_extension(id) ON DELETE SET NULL
);

-- 33
CREATE TABLE usuario_extensiones (
    usuario_id     UUID NOT NULL,
    extension_id   UUID NOT NULL,
    es_principal   BOOLEAN DEFAULT false,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, extension_id),
    CONSTRAINT fk_ue_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)    ON DELETE CASCADE,
    CONSTRAINT fk_ue_extension FOREIGN KEY (extension_id) REFERENCES extensiones(id) ON DELETE CASCADE
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 7: CLIENTES — CRM BASE
-- ════════════════════════════════════════════════════════════════════════════════
-- 3 tablas: clientes, telefonos_cliente, emails_cliente

-- 34
CREATE TABLE clientes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    apellido            VARCHAR(100),
    empresa_cliente     VARCHAR(150),
    ultimo_contacto     TIMESTAMP,
    notas               TEXT,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_clientes_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 35
CREATE TABLE telefonos_cliente (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id     UUID NOT NULL,
    telefono       VARCHAR(20) NOT NULL,
    es_principal   BOOLEAN DEFAULT false,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tel_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- 36
CREATE TABLE emails_cliente (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id     UUID NOT NULL,
    correo         CITEXT NOT NULL,
    es_principal   BOOLEAN DEFAULT false,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 8: AGENTES VIRTUALES (N02, N10, N16)
-- ════════════════════════════════════════════════════════════════════════════════
-- 4 tablas: catalogo_tipo_agente, versiones_prompt, agentes_virtuales, consumo_ia
-- Las FK con dependencias circulares se completan vía ALTER TABLE más abajo

-- 37
CREATE TABLE catalogo_tipo_agente (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    nombre         VARCHAR(100) NOT NULL,
    descripcion    TEXT,
    deleted_at     TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ta_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 38
-- Solo una versión activa por agente: garantizado por trigger tr_version_activa_prompt
-- y por el índice único parcial uq_prompt_activo
CREATE TABLE versiones_prompt (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agente_virtual_id  UUID NOT NULL,
    usuario_id         UUID NOT NULL,
    version            INT NOT NULL DEFAULT 1,
    prompt             TEXT NOT NULL,
    descripcion_cambio TEXT,
    es_activa          BOOLEAN DEFAULT false,
    fecha_registro     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vp_usuario               FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    CONSTRAINT chk_prompt_version_positiva CHECK (version > 0)
    -- FK a agentes_virtuales se agrega vía ALTER TABLE más abajo
);

-- 39
CREATE TABLE agentes_virtuales (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id                UUID NOT NULL,
    departamento_id           UUID,
    sucursal_id               UUID,
    numero_entrada            VARCHAR(10),
    nombre                    VARCHAR(100) NOT NULL,
    descripcion               TEXT,
    tipo_agente_id            UUID,
    estado_agente_id          UUID,
    calendario_id             UUID,
    pbx_ivr_id                VARCHAR(50),
    pbx_extension             VARCHAR(10),
    grupo_atencion_default_id UUID,
    deleted_at                TIMESTAMP,
    fecha_registro            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_av_empresa      FOREIGN KEY (empresa_id)       REFERENCES empresas(id)               ON DELETE CASCADE,
    CONSTRAINT fk_av_departamento FOREIGN KEY (departamento_id)  REFERENCES departamentos(id)          ON DELETE SET NULL,
    CONSTRAINT fk_av_sucursal     FOREIGN KEY (sucursal_id)      REFERENCES sucursales(id)             ON DELETE SET NULL,
    CONSTRAINT fk_av_tipo         FOREIGN KEY (tipo_agente_id)   REFERENCES catalogo_tipo_agente(id)   ON DELETE SET NULL,
    CONSTRAINT fk_av_estado       FOREIGN KEY (estado_agente_id) REFERENCES catalogo_estado_agente(id) ON DELETE SET NULL,
    CONSTRAINT fk_av_calendario   FOREIGN KEY (calendario_id)    REFERENCES calendarios(id)            ON DELETE SET NULL
    -- FK a grupos_atencion se agrega vía ALTER TABLE más abajo
);

-- ALTER TABLE: completa FK versiones_prompt → agentes_virtuales
ALTER TABLE versiones_prompt
    ADD CONSTRAINT fk_vp_agente
    FOREIGN KEY (agente_virtual_id) REFERENCES agentes_virtuales(id) ON DELETE CASCADE;

-- 40
-- NOTA: la FK llamada_id se agrega vía ALTER TABLE en el bloque 10
CREATE TABLE consumo_ia (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    llamada_id     UUID,
    proveedor_id   UUID,
    tokens_entrada INT DEFAULT 0,
    tokens_salida  INT DEFAULT 0,
    costo_estimado DECIMAL(10,6) DEFAULT 0,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cia_empresa   FOREIGN KEY (empresa_id)   REFERENCES empresas(id)               ON DELETE CASCADE,
    CONSTRAINT fk_cia_proveedor FOREIGN KEY (proveedor_id) REFERENCES catalogo_proveedores_ia(id) ON DELETE SET NULL,
    CONSTRAINT chk_tokens_positivos CHECK (tokens_entrada >= 0 AND tokens_salida >= 0)
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 9: GRUPOS DE ATENCIÓN Y WORKFLOWS (N11)
-- ════════════════════════════════════════════════════════════════════════════════
-- 6 tablas: catalogo_tipo_transferencia, grupos_atencion, grupos_extensiones,
--           workflows, workflow_versiones, reglas_workflow

-- 41
CREATE TABLE catalogo_tipo_transferencia (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    nombre         VARCHAR(50) NOT NULL,
    descripcion    TEXT,
    deleted_at     TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tt_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 42
CREATE TABLE grupos_atencion (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id            UUID NOT NULL,
    clave                 VARCHAR(50) NOT NULL,
    descripcion           TEXT,
    correo_grupo          CITEXT,
    tipo_transferencia_id UUID,
    calendario_id         UUID,
    pbx_queue_id          VARCHAR(50),
    deleted_at            TIMESTAMP,
    fecha_registro        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ga_empresa       FOREIGN KEY (empresa_id)            REFERENCES empresas(id)                    ON DELETE CASCADE,
    CONSTRAINT fk_ga_transferencia FOREIGN KEY (tipo_transferencia_id) REFERENCES catalogo_tipo_transferencia(id) ON DELETE SET NULL,
    CONSTRAINT fk_ga_calendario    FOREIGN KEY (calendario_id)         REFERENCES calendarios(id)                 ON DELETE SET NULL
);

-- ALTER TABLE: completa FK agentes_virtuales → grupos_atencion
ALTER TABLE agentes_virtuales
    ADD CONSTRAINT fk_av_grupo_default
    FOREIGN KEY (grupo_atencion_default_id) REFERENCES grupos_atencion(id) ON DELETE SET NULL;

-- 43
CREATE TABLE grupos_extensiones (
    grupo_id       UUID NOT NULL,
    extension_id   UUID NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (grupo_id, extension_id),
    CONSTRAINT fk_ge_grupo     FOREIGN KEY (grupo_id)     REFERENCES grupos_atencion(id) ON DELETE CASCADE,
    CONSTRAINT fk_ge_extension FOREIGN KEY (extension_id) REFERENCES extensiones(id)    ON DELETE CASCADE
);

-- 44
CREATE TABLE workflows (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         TEXT,
    estado_workflow_id  UUID,
    configuracion       JSONB,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wf_empresa FOREIGN KEY (empresa_id)        REFERENCES empresas(id)               ON DELETE CASCADE,
    CONSTRAINT fk_wf_estado  FOREIGN KEY (estado_workflow_id) REFERENCES catalogo_estado_workflow(id) ON DELETE SET NULL
);

-- 45
-- Solo una versión activa por workflow: garantizado por trigger tr_version_activa_workflow
-- y por el índice único parcial uq_workflow_activo
CREATE TABLE workflow_versiones (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id        UUID NOT NULL,
    usuario_id         UUID NOT NULL,
    version            INT NOT NULL DEFAULT 1,
    configuracion      JSONB NOT NULL,
    descripcion_cambio TEXT,
    es_activa          BOOLEAN DEFAULT false,
    fecha_registro     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wv_workflow                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    CONSTRAINT fk_wv_usuario                 FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)  ON DELETE RESTRICT,
    CONSTRAINT chk_workflow_version_positiva CHECK (version > 0)
);

-- 46
CREATE TABLE reglas_workflow (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id    UUID NOT NULL,
    condicion      JSONB NOT NULL,
    accion         JSONB NOT NULL,
    prioridad      INT DEFAULT 1,
    deleted_at     TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rw_workflow      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    CONSTRAINT chk_regla_prioridad CHECK (prioridad > 0)
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 10: LLAMADAS Y ANÁLISIS IA (N13)
-- ════════════════════════════════════════════════════════════════════════════════
-- 2 tablas: llamadas, auditorias_comandos_ia
-- Solo se almacena metadata de llamadas (N14 — Grabaciones — descartado)

-- 47
CREATE TABLE llamadas (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id           UUID NOT NULL,
    agente_id            UUID,
    workflow_id          UUID,
    cliente_id           UUID,
    pbx_call_id          VARCHAR(100),
    numero_origen        VARCHAR(20),
    numero_destino       VARCHAR(20),
    fecha_inicio         TIMESTAMP,
    fecha_fin            TIMESTAMP,
    duracion_seg         INT,
    sentimiento_id       UUID,
    estado_llamada_id    UUID,
    resultado_llamada_id UUID,
    clasificacion_ia     VARCHAR(100),
    transcripcion        TEXT,
    stt_proveedor_id     UUID,
    stt_estado           VARCHAR(30),
    respuesta_ia         TEXT,                       -- Bina 4: texto de respuesta de la IA
    llm_estado           VARCHAR(30),                -- Bina 4: estado del paso LLM
    tts_estado           VARCHAR(30),                -- Bina 4: estado del paso TTS
    escalada_humano      BOOLEAN DEFAULT false,
    extension_destino_id UUID,
    grupo_destino_id     UUID,
    metadata             JSONB,
    fecha_registro       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ll_empresa       FOREIGN KEY (empresa_id)           REFERENCES empresas(id)                   ON DELETE CASCADE,
    CONSTRAINT fk_ll_agente        FOREIGN KEY (agente_id)            REFERENCES agentes_virtuales(id)          ON DELETE SET NULL,
    CONSTRAINT fk_ll_workflow      FOREIGN KEY (workflow_id)          REFERENCES workflows(id)                  ON DELETE SET NULL,
    CONSTRAINT fk_ll_cliente       FOREIGN KEY (cliente_id)           REFERENCES clientes(id)                   ON DELETE SET NULL,
    CONSTRAINT fk_ll_sentim        FOREIGN KEY (sentimiento_id)       REFERENCES catalogo_sentimientos(id)      ON DELETE SET NULL,
    CONSTRAINT fk_ll_estado        FOREIGN KEY (estado_llamada_id)    REFERENCES catalogo_estado_llamada(id)    ON DELETE SET NULL,
    CONSTRAINT fk_ll_resultado     FOREIGN KEY (resultado_llamada_id) REFERENCES catalogo_resultado_llamada(id) ON DELETE SET NULL,
    CONSTRAINT fk_ll_stt           FOREIGN KEY (stt_proveedor_id)     REFERENCES catalogo_proveedores_ia(id)    ON DELETE SET NULL,
    CONSTRAINT fk_ll_ext_destino   FOREIGN KEY (extension_destino_id) REFERENCES extensiones(id)               ON DELETE SET NULL,
    CONSTRAINT fk_ll_grupo_destino FOREIGN KEY (grupo_destino_id)     REFERENCES grupos_atencion(id)            ON DELETE SET NULL,
    CONSTRAINT chk_duracion_positiva CHECK (duracion_seg IS NULL OR duracion_seg >= 0),
    CONSTRAINT chk_llamada_fechas    CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
    CONSTRAINT chk_stt_estado        CHECK (stt_estado IS NULL OR stt_estado IN ('pendiente','procesando','completado','error'))
);

COMMENT ON TABLE llamadas IS
'Registro de metadata de llamadas — N13. Módulo N14 (Grabaciones) descartado; el audio NO se almacena en BD.';

-- ALTER TABLE: completa FK consumo_ia → llamadas
ALTER TABLE consumo_ia
    ADD CONSTRAINT fk_cia_llamada
    FOREIGN KEY (llamada_id) REFERENCES llamadas(id) ON DELETE SET NULL;

-- 48
CREATE TABLE auditorias_comandos_ia (
    id                 BIGSERIAL PRIMARY KEY,
    empresa_id         UUID NOT NULL,
    usuario_id         UUID NOT NULL,
    llamada_id         UUID,
    comando_voz_puro   TEXT NOT NULL,
    respuesta_ia_puro  TEXT,                            -- Bina 4: respuesta cruda de la IA
    json_deducido      JSONB,
    tokens_consumidos  INT,
    status_resultado   VARCHAR(20) NOT NULL,
    respuesta_hardware JSONB,
    fecha_ejecucion    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_acia_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id)  ON DELETE CASCADE,
    CONSTRAINT fk_acia_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)  ON DELETE RESTRICT,
    CONSTRAINT fk_acia_llamada FOREIGN KEY (llamada_id) REFERENCES llamadas(id)  ON DELETE SET NULL,
    CONSTRAINT chk_acia_status CHECK (status_resultado IN ('exitoso', 'error', 'parcial')),
    CONSTRAINT chk_acia_tokens CHECK (tokens_consumidos IS NULL OR tokens_consumidos >= 0)
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 11: TICKETS Y CRM (N04)
-- ════════════════════════════════════════════════════════════════════════════════
-- 2 tablas: tickets, ticket_comentarios

-- 49
CREATE TABLE tickets (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id             UUID NOT NULL,
    llamada_id             UUID,
    cliente_id             UUID,
    usuario_responsable_id UUID,
    departamento_id        UUID,
    titulo                 VARCHAR(200) NOT NULL,
    descripcion            TEXT,
    estado_ticket_id       UUID,
    prioridad_ticket_id    UUID,
    deleted_at             TIMESTAMP,
    fecha_creacion         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre           TIMESTAMP,
    CONSTRAINT fk_tk_empresa   FOREIGN KEY (empresa_id)             REFERENCES empresas(id)                  ON DELETE CASCADE,
    CONSTRAINT fk_tk_llamada   FOREIGN KEY (llamada_id)             REFERENCES llamadas(id)                  ON DELETE SET NULL,
    CONSTRAINT fk_tk_cliente   FOREIGN KEY (cliente_id)             REFERENCES clientes(id)                  ON DELETE SET NULL,
    CONSTRAINT fk_tk_usuario   FOREIGN KEY (usuario_responsable_id) REFERENCES usuarios(id)                  ON DELETE SET NULL,
    CONSTRAINT fk_tk_depto     FOREIGN KEY (departamento_id)        REFERENCES departamentos(id)             ON DELETE SET NULL,
    CONSTRAINT fk_tk_estado    FOREIGN KEY (estado_ticket_id)       REFERENCES catalogo_estado_ticket(id)    ON DELETE SET NULL,
    CONSTRAINT fk_tk_prioridad FOREIGN KEY (prioridad_ticket_id)    REFERENCES catalogo_prioridad_ticket(id) ON DELETE SET NULL,
    CONSTRAINT chk_ticket_fechas CHECK (fecha_cierre IS NULL OR fecha_cierre >= fecha_creacion)
);

-- 50
CREATE TABLE ticket_comentarios (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id      UUID NOT NULL,
    usuario_id     UUID NOT NULL,
    comentario     TEXT NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tc_ticket  FOREIGN KEY (ticket_id)  REFERENCES tickets(id)  ON DELETE CASCADE,
    CONSTRAINT fk_tc_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 12: BASE DE CONOCIMIENTO IA (N09)
-- ════════════════════════════════════════════════════════════════════════════════
-- 8 tablas: documentos_ia, informacion_negocio, listas_faq,
--           catalogo_categorias_faq, preguntas_frecuentes,
--           listas_productos, catalogo_categorias_productos, productos_servicios

-- 51
CREATE TABLE documentos_ia (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    titulo              VARCHAR(200) NOT NULL,
    contenido           TEXT,
    tipo_documento_id   UUID,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dia_empresa FOREIGN KEY (empresa_id)       REFERENCES empresas(id)               ON DELETE CASCADE,
    CONSTRAINT fk_dia_tipo    FOREIGN KEY (tipo_documento_id) REFERENCES catalogo_tipo_documento_ia(id) ON DELETE SET NULL
);

-- 52
CREATE TABLE informacion_negocio (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    tema                VARCHAR(100) NOT NULL,
    descripcion         TEXT,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ib_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 53
CREATE TABLE listas_faq (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         TEXT,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lf_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 54
CREATE TABLE catalogo_categorias_faq (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    nombre         VARCHAR(100) NOT NULL,
    descripcion    TEXT,
    deleted_at     TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cfaq_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 55
CREATE TABLE preguntas_frecuentes (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lista_faq_id     UUID NOT NULL,
    pregunta         TEXT NOT NULL,
    respuesta        TEXT NOT NULL,
    categoria_faq_id UUID,
    deleted_at       TIMESTAMP,
    fecha_registro   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pf_lista     FOREIGN KEY (lista_faq_id)     REFERENCES listas_faq(id)              ON DELETE CASCADE,
    CONSTRAINT fk_pf_categoria FOREIGN KEY (categoria_faq_id) REFERENCES catalogo_categorias_faq(id) ON DELETE SET NULL
);

-- 56
CREATE TABLE listas_productos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    clave               VARCHAR(50) NOT NULL,
    descripcion         TEXT,
    deleted_at          TIMESTAMP,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lp_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 57
CREATE TABLE catalogo_categorias_productos (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    nombre         VARCHAR(100) NOT NULL,
    descripcion    TEXT,
    deleted_at     TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cp_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- 58
CREATE TABLE productos_servicios (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lista_producto_id     UUID NOT NULL,
    marca                 VARCHAR(100),
    modelo                VARCHAR(100),
    descripcion           TEXT,
    categoria_producto_id UUID,
    precio                DECIMAL(12,2),
    deleted_at            TIMESTAMP,
    fecha_registro        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ps_lista     FOREIGN KEY (lista_producto_id)     REFERENCES listas_productos(id)              ON DELETE CASCADE,
    CONSTRAINT fk_ps_categoria FOREIGN KEY (categoria_producto_id) REFERENCES catalogo_categorias_productos(id) ON DELETE SET NULL,
    CONSTRAINT chk_precio_positivo CHECK (precio IS NULL OR precio >= 0)
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 13: MÉTRICAS, EVENTOS Y AUDITORÍA (N03, N07, N12)
-- ════════════════════════════════════════════════════════════════════════════════
-- 2 tablas: eventos_tiempo_real, auditoria_logs
-- N12 no tiene tabla propia: las métricas se calculan desde llamadas vía fn_dashboard_empresa()

-- 59
CREATE TABLE eventos_tiempo_real (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    tipo_evento_id UUID,
    descripcion    TEXT,
    procesado      BOOLEAN DEFAULT false,
    metadata       JSONB,
    fecha_evento   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_etr_empresa     FOREIGN KEY (empresa_id)     REFERENCES empresas(id)            ON DELETE CASCADE,
    CONSTRAINT fk_etr_tipo_evento FOREIGN KEY (tipo_evento_id) REFERENCES catalogo_tipo_evento(id)
);

-- 60
CREATE TABLE auditoria_logs (
    id               BIGSERIAL PRIMARY KEY,
    empresa_id       UUID NOT NULL,
    usuario_id       UUID,
    ip               VARCHAR(45),
    modulo           VARCHAR(100),
    accion           VARCHAR(100) NOT NULL,
    tabla_afectada   VARCHAR(100),
    registro_id      UUID,
    datos_anteriores JSONB,
    datos_nuevos     JSONB,
    fecha_evento     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 14: JOBS ASÍNCRONOS
-- ════════════════════════════════════════════════════════════════════════════════
-- 1 tabla: jobs_async
-- worker_id + locked_at soportan el patrón SELECT FOR UPDATE SKIP LOCKED

-- 61
CREATE TABLE jobs_async (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID NOT NULL,
    tipo             VARCHAR(50) NOT NULL,
    payload          JSONB NOT NULL,
    status           VARCHAR(20) DEFAULT 'pendiente',
    intentos         INT DEFAULT 0,
    max_intentos     INT DEFAULT 3,
    error_detalle    TEXT,
    worker_id        VARCHAR(100),
    locked_at        TIMESTAMP,
    fecha_programada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_inicio     TIMESTAMP,
    fecha_fin        TIMESTAMP,
    fecha_registro   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_jobs_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT chk_intentos    CHECK (intentos >= 0 AND max_intentos > 0),
    CONSTRAINT chk_status_job  CHECK (status IN ('pendiente','procesando','completado','error','cancelado')),
    CONSTRAINT chk_job_fechas  CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);

COMMENT ON TABLE jobs_async IS
'Cola de jobs asíncronos. El worker externo debe usar SELECT FOR UPDATE SKIP LOCKED para consumo seguro en multi-instancia. worker_id identifica qué instancia tomó el job; locked_at es el timestamp de bloqueo.';


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 15: FUNCIONES Y TRIGGERS
-- ════════════════════════════════════════════════════════════════════════════════
-- 10 funciones | 12 triggers

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 1: Invalida sesiones activas anteriores al hacer login
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_desactivar_sesiones_anteriores()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sesiones
    SET activo = false
    WHERE usuario_id = NEW.usuario_id
      AND id != NEW.id
      AND activo = true;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_desactivar_sesiones_anteriores
    BEFORE INSERT ON sesiones
    FOR EACH ROW EXECUTE FUNCTION fn_desactivar_sesiones_anteriores();

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 2: Actualiza fecha_actualizacion automáticamente en UPDATE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_empresas_ts
    BEFORE UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER tr_config_empresa_ts
    BEFORE UPDATE ON configuraciones_empresa
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER tr_pbx_ts
    BEFORE UPDATE ON configuraciones_pbx
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER tr_agentes_ts
    BEFORE UPDATE ON agentes_virtuales
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER tr_workflows_ts
    BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 3: Solo una versión de prompt activa por agente
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_unica_version_activa_prompt()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.es_activa = true THEN
        UPDATE versiones_prompt
        SET es_activa = false
        WHERE agente_virtual_id = NEW.agente_virtual_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_version_activa_prompt
    BEFORE INSERT OR UPDATE ON versiones_prompt
    FOR EACH ROW EXECUTE FUNCTION fn_unica_version_activa_prompt();

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 4: Solo una versión de workflow activa por workflow
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_unica_version_activa_workflow()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.es_activa = true THEN
        UPDATE workflow_versiones
        SET es_activa = false
        WHERE workflow_id = NEW.workflow_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_version_activa_workflow
    BEFORE INSERT OR UPDATE ON workflow_versiones
    FOR EACH ROW EXECUTE FUNCTION fn_unica_version_activa_workflow();

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 5: Auditoría de cambios en agentes virtuales
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auditoria_agentes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO auditoria_logs (empresa_id, accion, tabla_afectada, registro_id, datos_anteriores, datos_nuevos)
    VALUES (
        NEW.empresa_id,
        TG_OP,
        'agentes_virtuales',
        NEW.id,
        CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::JSONB ELSE NULL END,
        row_to_json(NEW)::JSONB
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_auditoria_agentes
    AFTER INSERT OR UPDATE ON agentes_virtuales
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_agentes();

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 6: Auditoría de cambios en workflows
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auditoria_workflows()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO auditoria_logs (empresa_id, accion, tabla_afectada, registro_id, datos_anteriores, datos_nuevos)
    VALUES (
        NEW.empresa_id,
        TG_OP,
        'workflows',
        NEW.id,
        CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::JSONB ELSE NULL END,
        row_to_json(NEW)::JSONB
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_auditoria_workflows
    AFTER INSERT OR UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_workflows();

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 7: Evento WebSocket al crear una llamada
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_evento_nueva_llamada()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo_id UUID;
BEGIN
    SELECT id INTO v_tipo_id
    FROM catalogo_tipo_evento
    WHERE clave = 'call_started';

    INSERT INTO eventos_tiempo_real (empresa_id, tipo_evento_id, descripcion, metadata)
    VALUES (
        NEW.empresa_id,
        v_tipo_id,
        'Nueva llamada registrada',
        jsonb_build_object(
            'llamada_id',    NEW.id,
            'pbx_call_id',   NEW.pbx_call_id,
            'numero_origen', NEW.numero_origen
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_evento_nueva_llamada
    AFTER INSERT ON llamadas
    FOR EACH ROW EXECUTE FUNCTION fn_evento_nueva_llamada();

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 8: Evento WebSocket al crear un ticket
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_evento_nuevo_ticket()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo_id UUID;
BEGIN
    SELECT id INTO v_tipo_id
    FROM catalogo_tipo_evento
    WHERE clave = 'ticket_created';

    INSERT INTO eventos_tiempo_real (empresa_id, tipo_evento_id, descripcion, metadata)
    VALUES (
        NEW.empresa_id,
        v_tipo_id,
        'Nuevo ticket creado',
        jsonb_build_object(
            'ticket_id', NEW.id,
            'titulo',    NEW.titulo
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_evento_nuevo_ticket
    AFTER INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_evento_nuevo_ticket();

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 9: Dashboard KPIs para una empresa
-- USO: SELECT fn_dashboard_empresa('uuid-empresa');
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_dashboard_empresa(p_empresa_id UUID)
RETURNS JSONB AS $$
DECLARE
    resultado JSONB;
BEGIN
    SELECT jsonb_build_object(
        'llamadas_activas',
            (SELECT COUNT(*)
             FROM llamadas l
             JOIN catalogo_estado_llamada e ON l.estado_llamada_id = e.id
             WHERE l.empresa_id = p_empresa_id
               AND e.nombre IN ('En Espera', 'En Proceso')),
        'llamadas_hoy',
            (SELECT COUNT(*)
             FROM llamadas l
             WHERE l.empresa_id = p_empresa_id
               AND DATE(l.fecha_registro) = CURRENT_DATE),
        'tiempo_promedio_atencion_hoy',
            (SELECT COALESCE(ROUND(AVG(l.duracion_seg), 2), 0)
             FROM llamadas l
             WHERE l.empresa_id = p_empresa_id
               AND DATE(l.fecha_registro) = CURRENT_DATE),
        'llamadas_ia_hoy',
            (SELECT COUNT(*)
             FROM llamadas l
             WHERE l.empresa_id = p_empresa_id
               AND l.agente_id IS NOT NULL
               AND DATE(l.fecha_registro) = CURRENT_DATE),
        'llamadas_escaladas_humano_hoy',
            (SELECT COUNT(*)
             FROM llamadas l
             WHERE l.empresa_id = p_empresa_id
               AND l.escalada_humano = true
               AND DATE(l.fecha_registro) = CURRENT_DATE),
        'tasa_resolucion_hoy',
            (SELECT COALESCE(ROUND(
                COUNT(*) FILTER (WHERE rl.nombre = 'Exitosa') * 100.0 / NULLIF(COUNT(*), 0),
            2), 0)
             FROM llamadas l
             LEFT JOIN catalogo_resultado_llamada rl ON l.resultado_llamada_id = rl.id
             WHERE l.empresa_id = p_empresa_id
               AND DATE(l.fecha_registro) = CURRENT_DATE),
        'tickets_abiertos',
            (SELECT COUNT(*)
             FROM tickets t
             JOIN catalogo_estado_ticket e ON t.estado_ticket_id = e.id
             WHERE t.empresa_id = p_empresa_id
               AND t.deleted_at IS NULL
               AND e.nombre IN ('Abierto', 'En Proceso')),
        'agentes_disponibles',
            (SELECT COUNT(*)
             FROM agentes_virtuales av
             JOIN catalogo_estado_agente ea ON av.estado_agente_id = ea.id
             WHERE av.empresa_id = p_empresa_id
               AND av.deleted_at IS NULL
               AND ea.nombre = 'Disponible'),
        'sentimiento_promedio_hoy',
            (SELECT COALESCE(ROUND(AVG(
                CASE s.nombre
                    WHEN 'Positivo' THEN  1
                    WHEN 'Neutral'  THEN  0
                    WHEN 'Negativo' THEN -1
                    WHEN 'Molesto'  THEN -2
                END
            ), 2), 0)
             FROM llamadas l
             JOIN catalogo_sentimientos s ON l.sentimiento_id = s.id
             WHERE l.empresa_id = p_empresa_id
               AND DATE(l.fecha_registro) = CURRENT_DATE)
    ) INTO resultado;

    RETURN resultado;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN 10: Resumen de consumo IA por mes
-- USO: SELECT fn_consumo_ia_mes('uuid-empresa', 2026, 6);
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_consumo_ia_mes(p_empresa_id UUID, p_anio INT, p_mes INT)
RETURNS JSONB AS $$
DECLARE
    resultado JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_tokens_entrada', COALESCE(SUM(tokens_entrada), 0),
        'total_tokens_salida',  COALESCE(SUM(tokens_salida), 0),
        'costo_total',          COALESCE(SUM(costo_estimado), 0),
        'total_operaciones',    COUNT(*)
    ) INTO resultado
    FROM consumo_ia
    WHERE empresa_id = p_empresa_id
      AND EXTRACT(YEAR  FROM fecha_registro) = p_anio
      AND EXTRACT(MONTH FROM fecha_registro) = p_mes;

    RETURN resultado;
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 16: VISTAS
-- ════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW vw_llamadas_completas AS
SELECT
    l.id,
    l.empresa_id,
    l.pbx_call_id,
    l.numero_origen,
    l.numero_destino,
    l.fecha_inicio,
    l.fecha_fin,
    l.duracion_seg,
    l.transcripcion,
    l.stt_estado,
    l.escalada_humano,
    l.extension_destino_id,
    l.grupo_destino_id,
    av.nombre               AS agente_nombre,
    av.pbx_ivr_id,
    cs.nombre               AS sentimiento,
    el.nombre               AS estado_llamada,
    rl.nombre               AS resultado,
    cl.nombre               AS cliente_nombre,
    cl.apellido             AS cliente_apellido,
    ext_dest.extension      AS extension_destino,
    l.fecha_registro
FROM llamadas l
LEFT JOIN agentes_virtuales          av       ON l.agente_id            = av.id       AND av.deleted_at IS NULL
LEFT JOIN catalogo_sentimientos      cs       ON l.sentimiento_id       = cs.id
LEFT JOIN catalogo_estado_llamada    el       ON l.estado_llamada_id    = el.id
LEFT JOIN catalogo_resultado_llamada rl       ON l.resultado_llamada_id = rl.id
LEFT JOIN clientes                   cl       ON l.cliente_id           = cl.id       AND cl.deleted_at IS NULL
LEFT JOIN extensiones                ext_dest ON l.extension_destino_id = ext_dest.id;

CREATE OR REPLACE VIEW vw_tickets_completos AS
SELECT
    t.id,
    t.empresa_id,
    t.titulo,
    t.descripcion,
    t.fecha_creacion,
    t.fecha_cierre,
    et.nombre   AS estado,
    pt.nombre   AS prioridad,
    u.nombre    AS responsable,
    d.nombre    AS departamento,
    cl.nombre   AS cliente_nombre,
    cl.apellido AS cliente_apellido,
    l.numero_origen AS llamada_origen
FROM tickets t
LEFT JOIN catalogo_estado_ticket    et ON t.estado_ticket_id       = et.id
LEFT JOIN catalogo_prioridad_ticket pt ON t.prioridad_ticket_id    = pt.id
LEFT JOIN usuarios                   u ON t.usuario_responsable_id = u.id  AND u.deleted_at IS NULL
LEFT JOIN departamentos              d ON t.departamento_id        = d.id  AND d.deleted_at IS NULL
LEFT JOIN clientes                  cl ON t.cliente_id             = cl.id AND cl.deleted_at IS NULL
LEFT JOIN llamadas                   l ON t.llamada_id             = l.id
WHERE t.deleted_at IS NULL;

CREATE OR REPLACE VIEW vw_agentes_operativos AS
SELECT
    av.id,
    av.empresa_id,
    av.nombre,
    av.numero_entrada,
    av.pbx_ivr_id,
    av.pbx_extension,
    av.grupo_atencion_default_id,
    ta.nombre  AS tipo_agente,
    ea.nombre  AS estado,
    s.nombre   AS sucursal,
    d.nombre   AS departamento,
    vp.version AS version_prompt_activa
FROM agentes_virtuales av
LEFT JOIN catalogo_tipo_agente   ta ON av.tipo_agente_id    = ta.id
LEFT JOIN catalogo_estado_agente ea ON av.estado_agente_id  = ea.id
LEFT JOIN sucursales              s ON av.sucursal_id       = s.id  AND s.deleted_at IS NULL
LEFT JOIN departamentos           d ON av.departamento_id   = d.id  AND d.deleted_at IS NULL
LEFT JOIN versiones_prompt       vp ON vp.agente_virtual_id = av.id AND vp.es_activa = true
WHERE av.deleted_at IS NULL;

CREATE OR REPLACE VIEW vw_dashboard_general AS
SELECT
    e.id               AS empresa_id,
    e.nombre_comercial,
    (SELECT COUNT(*) FROM usuarios         u  WHERE u.empresa_id  = e.id AND u.deleted_at  IS NULL) AS usuarios_activos,
    (SELECT COUNT(*) FROM agentes_virtuales av WHERE av.empresa_id = e.id AND av.deleted_at IS NULL) AS agentes_activos,
    (SELECT COUNT(*) FROM extensiones      ext WHERE ext.empresa_id = e.id AND ext.deleted_at IS NULL) AS extensiones_activas,
    (SELECT COUNT(*) FROM llamadas         l  WHERE l.empresa_id  = e.id AND DATE(l.fecha_registro) = CURRENT_DATE) AS llamadas_hoy,
    (SELECT COALESCE(ROUND(AVG(l.duracion_seg), 2), 0)
     FROM llamadas l WHERE l.empresa_id = e.id AND DATE(l.fecha_registro) = CURRENT_DATE) AS tiempo_promedio_atencion_hoy,
    (SELECT COALESCE(ROUND(
         COUNT(*) FILTER (WHERE rl.nombre = 'Exitosa') * 100.0 / NULLIF(COUNT(*), 0),
     2), 0)
     FROM llamadas l
     LEFT JOIN catalogo_resultado_llamada rl ON l.resultado_llamada_id = rl.id
     WHERE l.empresa_id = e.id AND DATE(l.fecha_registro) = CURRENT_DATE) AS tasa_resolucion_hoy,
    (SELECT COUNT(*)
     FROM tickets t
     JOIN catalogo_estado_ticket et ON t.estado_ticket_id = et.id
     WHERE t.empresa_id = e.id AND t.deleted_at IS NULL
       AND et.nombre IN ('Abierto', 'En Proceso')) AS tickets_pendientes
FROM empresas e
WHERE e.status = 'activo'
  AND e.deleted_at IS NULL;


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 17: ÍNDICES DE RENDIMIENTO
-- ════════════════════════════════════════════════════════════════════════════════

-- Multi-tenant
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa    ON usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_extensiones_empresa ON extensiones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_agentes_empresa     ON agentes_virtuales(empresa_id);
CREATE INDEX IF NOT EXISTS idx_llamadas_empresa    ON llamadas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tickets_empresa     ON tickets(empresa_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa   ON auditoria_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_consumo_empresa     ON consumo_ia(empresa_id);
CREATE INDEX IF NOT EXISTS idx_eventos_empresa     ON eventos_tiempo_real(empresa_id);
CREATE INDEX IF NOT EXISTS idx_eventos_tipo        ON eventos_tiempo_real(tipo_evento_id, fecha_evento DESC);
CREATE INDEX IF NOT EXISTS idx_pbxraw_empresa      ON pbx_eventos_raw(empresa_id);

-- Compuestos estratégicos
CREATE INDEX IF NOT EXISTS idx_llamadas_empresa_fecha ON llamadas(empresa_id, fecha_registro DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_empresa_estado ON tickets(empresa_id, estado_ticket_id);
CREATE INDEX IF NOT EXISTS idx_jobs_empresa_status    ON jobs_async(empresa_id, status);

-- Llamadas
CREATE INDEX IF NOT EXISTS idx_llamadas_fecha    ON llamadas(fecha_registro);
CREATE INDEX IF NOT EXISTS idx_llamadas_pbx_call ON llamadas(pbx_call_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_llamadas_pbx_call
    ON llamadas(empresa_id, pbx_call_id) WHERE pbx_call_id IS NOT NULL;

-- Sesiones activas
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario
    ON sesiones(usuario_id) WHERE activo = true;

-- intentos_login (Bina 1)
CREATE INDEX IF NOT EXISTS idx_intentos_usuario_fecha
    ON intentos_login(usuario_id, fecha);

-- Sucursales (v3)
CREATE INDEX IF NOT EXISTS idx_usuarios_sucursal
    ON usuarios(sucursal_id) WHERE sucursal_id IS NOT NULL;

-- Versiones activas (refuerzan los triggers de versión única)
CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_activo
    ON versiones_prompt(agente_virtual_id) WHERE es_activa = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_activo
    ON workflow_versiones(workflow_id) WHERE es_activa = true;
CREATE INDEX IF NOT EXISTS idx_versiones_agente
    ON versiones_prompt(agente_virtual_id, fecha_registro DESC);

-- Eventos no procesados
CREATE INDEX IF NOT EXISTS idx_eventos_no_procesados
    ON eventos_tiempo_real(empresa_id) WHERE procesado = false;
CREATE INDEX IF NOT EXISTS idx_pbxraw_no_procesados
    ON pbx_eventos_raw(empresa_id) WHERE procesado = false;

-- Jobs — worker asíncrono
CREATE INDEX IF NOT EXISTS idx_jobs_pendientes_lock
    ON jobs_async(empresa_id, fecha_programada, status) WHERE status = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_jobs_worker
    ON jobs_async(worker_id, locked_at) WHERE status = 'procesando';
CREATE INDEX IF NOT EXISTS idx_jobs_pendientes
    ON jobs_async(empresa_id, fecha_programada) WHERE status = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_jobs_errores
    ON jobs_async(empresa_id, fecha_registro) WHERE status = 'error';

-- Auditoría
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha
    ON auditoria_logs(fecha_evento);
CREATE INDEX IF NOT EXISTS idx_auditoria_ia_empresa_fecha
    ON auditorias_comandos_ia(empresa_id, fecha_ejecucion);

-- JSONB (GIN)
CREATE INDEX IF NOT EXISTS idx_llamadas_metadata  ON llamadas        USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_wf_configuracion   ON workflows       USING GIN(configuracion);
CREATE INDEX IF NOT EXISTS idx_reglas_condicion   ON reglas_workflow USING GIN(condicion);
CREATE INDEX IF NOT EXISTS idx_reglas_accion      ON reglas_workflow USING GIN(accion);
CREATE INDEX IF NOT EXISTS idx_pbxraw_payload     ON pbx_eventos_raw USING GIN(payload);

-- Texto completo
CREATE INDEX IF NOT EXISTS idx_llamadas_transcripcion
    ON llamadas USING GIN(to_tsvector('spanish', COALESCE(transcripcion, '')));
CREATE INDEX IF NOT EXISTS idx_tickets_descripcion
    ON tickets  USING GIN(to_tsvector('spanish', COALESCE(descripcion, '')));


-- ════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 18: ÍNDICES ÚNICOS Y DE INTEGRIDAD
-- ════════════════════════════════════════════════════════════════════════════════

-- Empresas (Bina 1: codigo_acceso único entre empresas activas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_codigo_acceso
    ON empresas(codigo_acceso) WHERE deleted_at IS NULL;

-- Usuarios activos (permite reusar usuario/correo tras soft delete)
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_usuario
    ON usuarios(empresa_id, usuario) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_empresa_correo
    ON usuarios(empresa_id, correo) WHERE deleted_at IS NULL;

-- Versiones (número único por agente / workflow)
CREATE UNIQUE INDEX IF NOT EXISTS uq_versiones_prompt_agente_version
    ON versiones_prompt(agente_virtual_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_versiones_workflow_version
    ON workflow_versiones(workflow_id, version);

-- Teléfonos y correos de cliente
CREATE UNIQUE INDEX IF NOT EXISTS uq_telefonos_cliente_cliente_telefono
    ON telefonos_cliente(cliente_id, telefono);
CREATE UNIQUE INDEX IF NOT EXISTS uq_emails_cliente_cliente_correo
    ON emails_cliente(cliente_id, correo);

-- Horarios
CREATE UNIQUE INDEX IF NOT EXISTS uq_horarios_calendario_dia_hora
    ON horarios(calendario_id, dia_semana, hora_inicio, hora_fin);

-- Claves de listas (activas por empresa)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lista_extension_empresa_clave
    ON listas_extensiones(empresa_id, clave) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lista_faq_empresa_nombre
    ON listas_faq(empresa_id, nombre) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lista_producto_empresa_clave
    ON listas_productos(empresa_id, clave) WHERE deleted_at IS NULL;

-- Catálogos por empresa (activos)
CREATE UNIQUE INDEX IF NOT EXISTS uq_categoria_faq_empresa_nombre
    ON catalogo_categorias_faq(empresa_id, nombre) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categoria_producto_empresa_nombre
    ON catalogo_categorias_productos(empresa_id, nombre) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tipo_transferencia_empresa_nombre
    ON catalogo_tipo_transferencia(empresa_id, nombre) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendario_empresa_nombre
    ON calendarios(empresa_id, nombre) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_empresa_nombre
    ON workflows(empresa_id, nombre) WHERE deleted_at IS NULL;

-- Grupos de atención
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_empresa_clave
    ON grupos_atencion(empresa_id, clave) WHERE deleted_at IS NULL;

-- Agentes virtuales — críticos para routing e integración CloudUCM
CREATE UNIQUE INDEX IF NOT EXISTS uq_agente_numero_entrada
    ON agentes_virtuales(empresa_id, numero_entrada)
    WHERE numero_entrada IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agente_pbx_ivr
    ON agentes_virtuales(empresa_id, pbx_ivr_id)
    WHERE pbx_ivr_id IS NOT NULL AND deleted_at IS NULL;

-- Roles
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_empresa_nombre_local
    ON catalogo_roles(empresa_id, nombre)
    WHERE empresa_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_global_nombre
    ON catalogo_roles(nombre)
    WHERE empresa_id IS NULL AND deleted_at IS NULL;

-- Login rápido
CREATE INDEX IF NOT EXISTS idx_usuarios_login
    ON usuarios(empresa_id, usuario) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_correo
    ON usuarios(empresa_id, correo) WHERE deleted_at IS NULL;

-- Extensión principal única por usuario
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_extension_principal
    ON usuario_extensiones(usuario_id) WHERE es_principal = true;


-- ════════════════════════════════════════════════════════════════════════════════
-- NOTAS SOBRE ÍNDICES REDUNDANTES (pendiente revisión con EXPLAIN ANALYZE)
-- ════════════════════════════════════════════════════════════════════════════════

COMMENT ON INDEX idx_llamadas_empresa IS
'REDUNDANTE PARCIAL: idx_llamadas_empresa_fecha cubre la mayoría de queries con filtro por empresa. Evaluar con EXPLAIN ANALYZE en producción antes de eliminar.';

COMMENT ON INDEX idx_jobs_empresa_status IS
'REDUNDANTE PARCIAL: idx_jobs_pendientes e idx_jobs_errores cubren los casos más frecuentes. Evaluar eliminación.';

-- ════════════════════════════════════════════════════════════════════════════════
-- APÉNDICE A: MIGRACIÓN DE DEPARTAMENTOS — SOLO PARA BASES DE DATOS YA DESPLEGADAS
-- ════════════════════════════════════════════════════════════════════════════════
-- NO ejecutar en una instalación desde cero: en el script v4 los permisos
-- departamentos.ver / departamentos.gestionar YA están en el catálogo (Bloque 3) y
-- los seeds ya los asignan al rol "Administrador de Sucursal" (queda con 58 permisos).
--
-- Usa este bloque ÚNICAMENTE si tienes una BD anterior (v3 o previa) en la que
-- necesitas añadir estos permisos sin recrear todo. Es idempotente.
--
-- CORRECCIÓN respecto de la migración original: el nombre del rol es
-- 'Administrador de Sucursal' (con "de"), no 'Administrador Sucursal'. Con el nombre
-- viejo, la migración asignaba 0 permisos.

/*
BEGIN;

-- Paso 1: Insertar permisos en el catálogo (si no existen)
INSERT INTO permisos (id, clave, nombre, descripcion, modulo)
VALUES
  (uuid_generate_v4(), 'departamentos.ver',
   'Ver Departamentos', 'Consultar la lista de departamentos de la sucursal', 'Seguridad'),
  (uuid_generate_v4(), 'departamentos.gestionar',
   'Gestionar Departamentos', 'Crear, editar y eliminar departamentos de la sucursal', 'Seguridad')
ON CONFLICT (clave) DO NOTHING;

-- Paso 2: Asignar ambos permisos a TODOS los roles "Administrador de Sucursal"
--         (de todas las empresas). Nombre corregido.
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM catalogo_roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Administrador de Sucursal'   -- corregido (antes: 'Administrador Sucursal')
  AND r.deleted_at IS NULL
  AND p.clave IN ('departamentos.ver', 'departamentos.gestionar')
ON CONFLICT DO NOTHING;

-- Verificación:
--   SELECT cr.nombre AS rol, p.clave AS permiso
--   FROM roles_permisos rp
--   JOIN catalogo_roles cr ON cr.id = rp.rol_id
--   JOIN permisos p        ON p.id  = rp.permiso_id
--   WHERE p.clave IN ('departamentos.ver', 'departamentos.gestionar')
--   ORDER BY cr.nombre;

COMMIT;
*/

-- ════════════════════════════════════════════════════════════════════════════════
-- FIN DEL SCRIPT v5
-- ════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- FIN DEL ESQUEMA v5 (estructura)
-- Para datos de prueba de desarrollo: ejecutar db/seeds/seed_desarrollo.sql
-- ════════════════════════════════════════════════════════════════════════════