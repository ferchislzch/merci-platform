# Justificación de Arquitectura Híbrida

**Bina #4 — Johann & Kevin**  
**Versión:** 1.0 — Junio 2025

---

## Contexto

La Guía de Bina 4 especifica que todos los jobs deben implementarse con la firma
`const handle = async (payload, empresaId) => { ... }` y ser despachados por el
ciclo central de `worker.service.js`. Esta arquitectura es correcta y suficiente
para los jobs de negocio general (`workflowTrigger`, `ticketAuto`, `grabacionFetch`),
que siguen exactamente ese patrón.

Sin embargo, los tres jobs del pipeline de IA conversacional (`sttProceso`,
`llmProceso`, `ttsProceso`) presentan requisitos de operación incompatibles con el
despachador central. A continuación se documenta por qué fue necesario transformarlos
en Daemons Autónomos, y por qué esta decisión no rompe la arquitectura existente.

---

## 1. Latencia mínima: la telephonía no espera al siguiente batch

El despachador central de `worker.service.js` opera con un ciclo de polling
configurable (`WORKER_POLL_INTERVAL_MS`). En un entorno de productividad normal
este intervalo puede ser de varios segundos o incluso minutos.

El pipeline de IA de MERCI opera sobre **llamadas telefónicas activas**. La secuencia
STT → LLM → TTS debe completarse mientras el cliente sigue en la línea. Un cliente
no puede esperar 3 ciclos de polling (potencialmente 15–30 segundos) entre cada paso.
Los Daemons Autónomos sondenan su cola dedicada cada 5 segundos de forma
independiente, sin compartir el ciclo con jobs de menor urgencia.

```
Despachador Central (compartido):
  batch genérico → [workflow_trigger, ticket_auto, stt_proceso, llm_proceso, tts_proceso]
  → todos compiten por el mismo intervalo de polling
  → un lote grande de tickets puede retrasar el pipeline de voz

Daemons Autónomos (dedicados):
  sttWorker  → sondeo propio cada 5s → SOLO 'transcribir_audio'
  llmWorker  → sondeo propio cada 5s → SOLO 'procesar_llm'
  ttsWorker  → sondeo propio cada 5s → SOLO 'procesar_tts'
  → aislamiento total de latencia
```

---

## 2. Self-chaining atómico: el pipeline no puede quedar sin orquestador

La guía propone que cada job llame a `jobsAsyncRepository.encolar()` para detonar
el siguiente job. Esto funciona bien para flujos donde el siguiente paso es opcional
o puede esperar. Para el pipeline de voz, la situación es diferente:

- Si el LLM Worker completa pero el job TTS no se encola **en la misma ejecución**,
  la llamada queda con `llm_estado = 'completado'` pero sin voz que reproducir.
- No existe ningún otro proceso que detecte este estado inconsistente y encole el
  job faltante.

Los Daemons Autónomos implementan el self-chaining dentro del propio job, como
parte de su flujo de éxito, antes de marcar el job como completado. Esto garantiza
que el siguiente paso siempre existe o el error queda registrado de forma descriptiva.

```
STT Worker (al completar exitosamente):
  1. Guarda transcripcion en llamadas
  2. Registra consumo_ia
  3. INSERT jobs_async tipo='procesar_llm'  ← atómico
  4. UPDATE jobs_async status='completado'

Si el paso 3 falla, el job STT NO se marca como completado
→ reintento automático del worker incluye el re-encole
```

---

## 3. Gestión de estados: el dashboard necesita visibilidad granular

La tabla `llamadas` expone tres campos de estado añadidos por esta bina:
`stt_estado`, `llm_estado`, `tts_estado`. Estos campos tienen dos propósitos:

1. **Recuperación de errores**: si un daemon cae a mitad de proceso, el campo
   `procesando` permite detectar jobs huérfanos y limpiarlos.
2. **Dashboard en tiempo real**: el frontend (Bina 1 vía WebSocket) puede mostrar
   en qué paso del pipeline de IA se encuentra cada llamada activa.

El despachador central no tiene visibilidad sobre el estado interno de cada paso —
solo sabe si el `handle()` completo tuvo éxito o falló. Un handler que englobe
STT+LLM+TTS fallaría en el paso 2 sin dejar rastro de que el STT ya completó,
perdiendo el audio transcrito y cobrandole el costo STT a la empresa sin resultado.

---

## 4. Gestión de sesión con CloudUCM: estado que no pertenece al payload

El job STT descarga el audio desde CloudUCM vía la acción `recapi`, que requiere
autenticación MD5 en dos pasos (challenge + token). Esta sesión tiene un TTL de
30 minutos y necesita renovarse automáticamente.

El patrón `handle(payload, empresaId)` no tiene un lugar natural para gestionar
este estado de sesión entre ejecuciones sucesivas. Los Daemons Autónomos
instancian un `CloudUCMProvider` nuevo por ejecución de job, permitiendo que
`_ensureSession()` maneje la autenticación de forma transparente sin contaminar
el payload ni el despachador central.

---

## 5. Compatibilidad: `worker.service.js` no fue roto, fue extendido

La modificación a `worker.service.js` fue **aditiva y backward-compatible**:

| Elemento | Estado |
|---|---|
| `start()` / `stop()` — API pública | ✅ Preservados sin cambios |
| `tick()` / `obtenerJobs()` — ciclo central | ✅ Preservados sin cambios |
| `HANDLERS` — mapa de jobs legacy | ✅ Preservado (`workflow_trigger`, `ticket_auto`, `grabacion_fetch`) |
| Llamada en `server.js` | ✅ Sin cambios necesarios |
| Jobs de IA autónomos | ✅ Iniciados en `start()`, detenidos en `stop()` |

`stt_proceso` fue removido de `HANDLERS` porque ya no es un handler — es un
daemon con su propio ciclo. No se perdió ninguna funcionalidad; se migró a un
modelo más apropiado para sus requisitos.

---

## 6. Divergencia en el API Envelope (aclaración)

La guía especifica `{ ok, mensaje, data }` como envelope estándar del proyecto.
Nuestros providers internamente retornan `{ success, message, data }`. Esta
divergencia no rompe el contrato porque:

- Los jobs **no exponen endpoints HTTP** — operan exclusivamente dentro del worker.
- El envelope `{ ok, mensaje }` aplica a controllers HTTP, no a funciones internas.
- Si en el futuro se construyen controllers alrededor de los jobs (ej: endpoint de
  reintento manual), estos controllers traducirán el resultado al formato `{ ok, mensaje }`.

---

## Conclusión

La arquitectura híbrida preserva el 100% de la funcionalidad existente del
despachador central y añade un sistema de daemons dedicados para los requisitos
específicos del pipeline de IA conversacional en tiempo real. Los dos jobs de negocio
general (`workflowTrigger`, `ticketAuto`) se implementaron con la firma estándar
`handle(payload, empresaId)` requerida por la guía.

