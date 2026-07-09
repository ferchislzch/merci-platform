# Guía de Pruebas Locales — Pipeline de IA
**Bina #4 — Johann & Kevin**

---

## Índice
1. [Prerequisitos](#1-prerequisitos)
2. [Verificación del entorno](#2-verificación-del-entorno)
3. [Ejecutar el script de simulación](#3-ejecutar-el-script-de-simulación)
4. [Monitorear los logs en tiempo real](#4-monitorear-los-logs-en-tiempo-real)
5. [Validar resultados en Prisma Studio](#5-validar-resultados-en-prisma-studio)
6. [Resultados esperados por tabla](#6-resultados-esperados-por-tabla)
7. [Troubleshooting — Errores comunes](#7-troubleshooting--errores-comunes)
8. [Limpieza de datos de prueba](#8-limpieza-de-datos-de-prueba)

---

## 1. Prerequisitos

### Software requerido

| Herramienta | Versión mínima | Verificar con |
|---|---|---|
| Node.js | 18+ | `node --version` |
| ffmpeg | 4.0+ | `ffmpeg -version` |
| PostgreSQL | 14+ | corriendo localmente |

> ⚠️ **ffmpeg es obligatorio** para el TTS Worker.  
> Si no está instalado: `sudo apt-get install -y ffmpeg` (Ubuntu) o `brew install ffmpeg` (macOS)

### Base de datos

La BD local debe tener al menos:
- [ ] 1 registro en `empresas`
- [ ] 1 registro en `usuarios` vinculado a esa empresa
- [ ] 1 registro en `configuraciones_empresa` con `credenciales_ia.openai_api_key` configurada

---

## 2. Verificación del entorno

### 2.1 Configurar el archivo `.env`

Las siguientes variables son **obligatorias** para el pipeline de IA:

```bash
# Base de datos
DATABASE_URL="postgresql://usuario:password@localhost:5432/merci_db"

# OpenAI — API Key real (no de prueba)
# Obtener en: https://platform.openai.com/api-keys
OPENAI_API_KEY="sk-proj-..."   # Solo si tu código lo usa globalmente
                                # Bina 4 usa configuraciones_empresa.credenciales_ia

# Worker — configuración del Despachador Central
WORKER_POLL_INTERVAL_MS=5000   # Frecuencia de polling (5 segundos)
WORKER_BATCH_SIZE=5            # Jobs por ciclo

# Precios de IA para facturación (con margen MERCI)
MERCI_MARGIN_PERCENTAGE=10
PRICE_OPENAI_STT_PER_MIN=0.006
PRICE_OPENAI_LLM_INPUT_PER_1M=2.50
PRICE_OPENAI_LLM_OUTPUT_PER_1M=10.00
PRICE_OPENAI_TTS_PER_1M_CHARS=15.00
```

### 2.2 Verificar credenciales IA en la BD

Ejecutar en psql o Prisma Studio:

```sql
SELECT
  empresa_id,
  credenciales_ia->>'openai_api_key' AS api_key_configurada,
  modelo_ia,
  idioma,
  voz_ia
FROM configuraciones_empresa
LIMIT 5;
```

Si `api_key_configurada` es null, actualizarla:

```sql
UPDATE configuraciones_empresa
SET credenciales_ia = jsonb_set(
  COALESCE(credenciales_ia, '{}'),
  '{openai_api_key}',
  '"sk-proj-TU_API_KEY_AQUI"'
)
WHERE empresa_id = 'TU-EMPRESA-UUID';
```

### 2.3 Verificar que versiones_prompt necesita un usuario

> ℹ️ La tabla `versiones_prompt` tiene `usuario_id NOT NULL`.  
> El script busca automáticamente el primer usuario activo de la empresa.  
> Si el script falla con "No existe ningún usuario", crea uno vía el módulo de Bina 1.

---

## 3. Ejecutar el script de simulación

### Paso 1 — Arrancar el servidor (terminal 1)

```bash
npm run dev
```

Esperar hasta ver en los logs:

```
[worker] Despachador central iniciado — polling cada 5000ms
[STT Job][stt-worker-pid...] 🚀 Worker STT iniciado.
[LLM Job][llm-worker-pid...] 🚀 Worker LLM iniciado.
[TTS Job][tts-worker-pid...] 🚀 Worker TTS iniciado.
```

> ⚠️ Los tres workers deben estar activos antes de correr el script.

### Paso 2 — Ejecutar el script (terminal 2)

```bash
node scripts/test-ia-pipeline.js
```

El script imprimirá el progreso por fases:

```
──────────────────────────────────────────────────────────────────────
🧪 Script de Prueba del Pipeline IA — Bina #4

🧹 Limpiando datos de prueba anteriores...
   ℹ️  No había datos de prueba previos.

📋 Fase 1: Verificando prerequisitos...
✅ Empresa encontrada: "Hotel Boutique XYZ" (uuid-empresa)
✅ Configuración IA OK: modelo = gpt-4o
✅ Usuario encontrado: "Admin" (admin@hotel.com)

🏗️  Fase 2: Creando datos de prueba...
✅ Agente de prueba creado: "[TEST-BINA4] Agente de Prueba IA"
✅ Prompt de sistema creado: v1, es_activa=true
✅ Llamada de prueba creada: (uuid-llamada)

⚡ Fase 3: Insertando job en la cola...
✅ Job insertado en cola: tipo='procesar_llm', status='pendiente'

🚀 PIPELINE LISTO — Esperando que los Daemons procesen los jobs
   ID de llamada: uuid-llamada
```

---

## 4. Monitorear los logs en tiempo real

Volver a la **terminal 1** (donde corre `npm run dev`). En los siguientes **5–30 segundos** deberías ver esta secuencia:

### 4.1 Logs esperados — LLM Worker (éxito total)

```log
[LLM Job][llm-worker-pid12345] ▶ Iniciando job abc-123 | llamada: uuid-llamada
[AIProviderFactory] 'OpenAI GPT-4o' instanciado para empresa uuid-empresa (tipo: llm).
[LLM Job][llm-worker-pid12345] Prompt activo v1 para agente uuid-agente (287 chars)
[LLM Job][llm-worker-pid12345] 🤖 Llamando al LLM (modelo: gpt-4o, temperatura: 0.7, historial: 0 msgs)...
[LLM Job][llm-worker-pid12345] ✅ LLM OK | modelo: gpt-4o | tokens in/out: 145/38
[AIProviderFactory] consumo_ia registrado | empresa: uuid-empresa | tipo: llm | costo: $0.000743 USD
[LLM Job][llm-worker-pid12345] ✔ Job abc-123 completado | llamada: uuid-llamada
[SocketService STUB] → sala: 'empresa:uuid-empresa' | evento: 'llm_completado'
```

### 4.2 Logs esperados — TTS Worker (fallo esperado en CloudUCM)

```log
[TTS Job][tts-worker-pid12345] ▶ Iniciando job def-456 | llamada: uuid-llamada
[TTS Job][tts-worker-pid12345] ❌ Error en job def-456 (intento 1/3): La llamada uuid-llamada no
tiene 'pbx_call_id' (canal activo). El usuario probablemente colgó antes de que el pipeline TTS
iniciara. Se aborta la síntesis para conservar tokens y evitar costos innecesarios.
[TTS Job][tts-worker-pid12345] Job def-456 regresado a 'pendiente' para reintento.
```

> ✅ **Este error es CORRECTO y esperado.** El FAIL-FAST funcionó:
> - No se consumieron tokens de TTS (ahorro de dinero)
> - El manejo de errores y reintentos funciona correctamente
> - El pipeline LLM→TTS self-chaining está operativo

---

## 5. Validar resultados en Prisma Studio

```bash
npx prisma studio
```

Abrir `http://localhost:5555` en el navegador.

### 5.1 Tabla `llamadas` — filtrar por `id`

| Campo | Valor esperado | ¿Qué valida? |
|---|---|---|
| `transcripcion` | "Hola, quiero saber a qué hora..." | Input del LLM inyectado por el script |
| `stt_estado` | `completado` | Simulado por el script |
| `llm_estado` | `completado` | ✅ LLM Worker procesó correctamente |
| `respuesta_ia` | Texto generado por GPT-4o | ✅ OpenAI respondió y el campo se guardó |
| `tts_estado` | `error` | ✅ FAIL-FAST esperado (no hay pbx_call_id) |
| `agente_id` | UUID del agente de prueba | FK correcta |

### 5.2 Tabla `auditorias_comandos_ia` — filtrar por `llamada_id`

| Campo | Valor esperado |
|---|---|
| `empresa_id` | UUID de la empresa |
| `llamada_id` | UUID de la llamada de prueba |
| `usuario_id` | `null` (llamada sin usuario del sistema) |
| `comando_voz_puro` | "Hola, quiero saber a qué hora..." |
| `respuesta_ia_puro` | Respuesta generada por GPT-4o |
| `tokens_consumidos` | Suma de tokens entrada + salida |
| `status_resultado` | `exitoso` |
| `json_deducido` | `{ "modelo_usado": "gpt-4o", "tokens_entrada": N, ... }` |

### 5.3 Tabla `consumo_ia` — filtrar por `llamada_id`

| Campo | Valor esperado |
|---|---|
| `empresa_id` | UUID de la empresa |
| `llamada_id` | UUID de la llamada de prueba |
| `proveedor_id` | `null` (usó default) |
| `tokens_entrada` | ~100-200 (tokens del prompt system + user) |
| `tokens_salida` | ~30-80 (tokens de la respuesta) |
| `costo_estimado` | Decimal con 6 cifras (ej: `0.000743`) |

### 5.4 Tabla `jobs_async` — filtrar por `tipo`

| `tipo` | `status` esperado | Notas |
|---|---|---|
| `procesar_llm` | `completado` | ✅ LLM Worker completó el job |
| `procesar_tts` | `error` o `pendiente` | ✅ TTS FAIL-FAST activado |

---

## 6. Resultados esperados por tabla

### Árbol de estados esperados

```
jobs_async
├── procesar_llm  → status: 'completado'   ✅
└── procesar_tts  → status: 'error'        ✅ (esperado, no hay UCM)

llamadas
├── stt_estado:   'completado'             ✅ (simulado)
├── llm_estado:   'completado'             ✅ (real)
├── tts_estado:   'error'                  ✅ (esperado)
├── transcripcion: "Hola, quiero saber..." ✅
└── respuesta_ia:  "[respuesta de GPT-4o]" ✅

auditorias_comandos_ia
└── 1 registro con comando_voz_puro + respuesta_ia_puro ✅

consumo_ia
└── 1 registro con costo_estimado del LLM ✅
```

---

## 7. Troubleshooting — Errores comunes

### ❌ "No existe ninguna empresa en la BD local"

**Causa:** No hay registros en la tabla `empresas`.

**Solución:**
```sql
INSERT INTO empresas (nombre_comercial) VALUES ('Empresa de Prueba QA');
```
O crear via el módulo de Bina 1 (módulo de administración de empresas).

---

### ❌ "No existe ningún usuario para la empresa"

**Causa:** `versiones_prompt.usuario_id` es NOT NULL y necesita un usuario real.

**Solución:** Crear un usuario via Bina 1 (módulo auth) o:
```sql
INSERT INTO usuarios (empresa_id, nombre, correo, password_hash)
VALUES ('uuid-empresa', 'QA Tester', 'qa@test.com', 'hash-dummy');
```

---

### ❌ "La empresa no tiene 'openai_api_key' configurada"

**Causa:** `configuraciones_empresa.credenciales_ia` es null o no tiene el campo `openai_api_key`.

**Solución:**
```sql
UPDATE configuraciones_empresa
SET credenciales_ia = '{"openai_api_key": "sk-proj-TU_KEY_REAL"}'
WHERE empresa_id = 'TU-UUID';
```

---

### ❌ "[AIProviderFactory] NotImplementedError: El proveedor ... aún no está implementado"

**Causa:** `configuraciones_empresa.proveedor_llm_id` apunta a Google Gemini u otro proveedor sin clase implementada.

**Solución:** Cambiar a `null` (usará OpenAI GPT-4o por default):
```sql
UPDATE configuraciones_empresa
SET proveedor_llm_id = NULL
WHERE empresa_id = 'TU-UUID';
```

---

### ❌ "ffmpeg no encontrado en el PATH del sistema"

**Causa:** El TTS Worker usa ffmpeg para resamplear audio a 8kHz G.711.

**Solución:**
```bash
# Ubuntu/Debian
sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg

# Verificar instalación
ffmpeg -version
```

---

### ❌ El job LLM no aparece como 'procesando' después de 10 segundos

**Causas posibles:**

1. **El servidor no está corriendo** — verificar `npm run dev` en terminal 1
2. **Workers no iniciados** — buscar en logs: `"Worker LLM iniciado"`
3. **Error en la BD** — verificar que el job está en `status = 'pendiente'` en `jobs_async`

```sql
SELECT id, tipo, status, error_detalle, intentos
FROM jobs_async
WHERE tipo IN ('procesar_llm', 'procesar_tts')
ORDER BY fecha_registro DESC
LIMIT 5;
```

---

### ❌ "OpenAI AuthenticationError" o error 401

**Causa:** La `openai_api_key` en `configuraciones_empresa` es inválida o caducó.

**Solución:** Actualizar con una key válida desde https://platform.openai.com/api-keys

---

### ❌ "No existe handler para el tipo de job: procesar_llm"

**Causa:** El job fue tomado por el **Despachador Central** (tick) en lugar del Daemon Autónomo.

**Contexto:** El Despachador Central no tiene `procesar_llm` en su `HANDLERS`. Si lo toma, lo marcará como error inmediatamente.

**Solución:** Verificar que en `worker.service.js` el objeto `HANDLERS` **NO** incluye `procesar_llm`, `procesar_tts`, ni `transcribir_audio`. Estos tipos solo deben ser consumidos por los Daemons Autónomos.

```javascript
// CORRECTO en worker.service.js:
const HANDLERS = {
  workflow_trigger: workflowTrigger.handle,
  ticket_auto:      ticketAuto.handle,
  grabacion_fetch:  grabacionFetch.handle,
  // ← NO debe haber procesar_llm, procesar_tts, ni transcribir_audio aquí
}
```

---

### ❌ El LLM responde pero `respuesta_ia` en `llamadas` está null

**Causa:** El `provider.chat()` retornó `success: true` pero `texto_generado` está vacío,  
o el `UPDATE` de `llamadas` falló silenciosamente.

**Diagnóstico:**
```sql
SELECT id, llm_estado, respuesta_ia, llm_estado
FROM llamadas
WHERE id = 'UUID-DE-TU-LLAMADA';

-- Revisar auditoría del LLM:
SELECT comando_voz_puro, respuesta_ia_puro, json_deducido
FROM auditorias_comandos_ia
WHERE llamada_id = 'UUID-DE-TU-LLAMADA';
```

---

## 8. Limpieza de datos de prueba

Al terminar las pruebas, eliminar todos los registros creados por el script:

```bash
node scripts/test-ia-pipeline.js --clean
```

El script eliminará en orden correcto (respetando FK):
- Jobs `_test_bina4` de `jobs_async`
- `llamadas` vinculadas al agente de prueba
- `versiones_prompt` (en cascada con el agente)
- `agentes_virtuales` con nombre `[TEST-BINA4] Agente de Prueba IA`

> ⚠️ `auditorias_comandos_ia` y `consumo_ia` quedarán en la BD (tienen FK a `llamadas`  
> con `ON DELETE CASCADE`). Se eliminarán automáticamente al borrar la llamada.

---

## Checklist de prueba completada

- [ ] `npm run dev` muestra los 3 workers iniciados
- [ ] Script ejecuta sin errores en Fases 1, 2 y 3
- [ ] Log LLM Worker: `✔ Job completado`
- [ ] Log TTS Worker: `❌ Error ... pbx_call_id` (ESPERADO ✅)
- [ ] `llamadas.llm_estado = 'completado'` en Prisma Studio
- [ ] `llamadas.respuesta_ia` contiene texto coherente generado por GPT-4o
- [ ] `auditorias_comandos_ia` tiene 1 registro con `respuesta_ia_puro`
- [ ] `consumo_ia` tiene 1 registro con `costo_estimado > 0`
- [ ] `node scripts/test-ia-pipeline.js --clean` elimina datos correctamente

---

*Guía mantenida por Bina #4 (Johann & Kevin). Última actualización: Junio 2025.*
