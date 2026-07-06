/**
 * test-ia-pipeline.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Script de Simulación del Pipeline IA — Bina #4
 * Ruta: scripts/test-ia-pipeline.js
 *
 * PROPÓSITO:
 *   Inyectar datos de prueba en la BD local para disparar y validar el
 *   pipeline LLM → TTS sin necesitar CloudUCM real ni la Bina 3.
 *
 * QUÉ OMITIMOS INTENCIONALMENTE:
 *   · STT Worker: requiere descargar audio real desde CloudUCM via 'recapi'.
 *     En su lugar, insertamos la 'transcripcion' directamente en 'llamadas'.
 *   · CloudUCM playback: el TTS sintetizará el audio (consumiendo tokens OpenAI)
 *     pero fallará en 'uploadPrompt' porque no hay UCM local. Esto es ESPERADO
 *     y valida que el FAIL-FAST y el manejo de errores funcionan correctamente.
 *
 * FLUJO QUE SE ACTIVA AL CORRER ESTE SCRIPT:
 *   1. Este script inserta un job 'procesar_llm' en jobs_async
 *   2. El Daemon LLM (llmProceso.job.js) lo detecta en su próximo ciclo (5s)
 *   3. LLM lee 'llamadas.transcripcion' como promptUser
 *   4. LLM lee 'versiones_prompt' activo del agente como promptSystem
 *   5. LLM llama a OpenAI GPT-4o y guarda 'respuesta_ia' en 'llamadas'
 *   6. LLM inserta automáticamente un job 'procesar_tts' (self-chaining)
 *   7. El Daemon TTS (ttsProceso.job.js) lo detecta en su próximo ciclo (5s)
 *   8. TTS lee 'llamadas.respuesta_ia' y sintetiza audio con OpenAI TTS
 *   9. TTS intenta subir a CloudUCM → FALLA (esperado, no hay UCM local)
 *  10. TTS job queda en 'error' con mensaje descriptivo
 *
 * PREREQUISITOS:
 *   · servidor Node.js corriendo (npm run dev) — los workers deben estar activos
 *   · .env configurado con OPENAI_API_KEY válida
 *   · Al menos 1 empresa y 1 usuario en la BD local
 *   · configuraciones_empresa con credenciales_ia.openai_api_key configurada
 *
 * USO:
 *   node scripts/test-ia-pipeline.js           ← Crea datos y dispara el pipeline
 *   node scripts/test-ia-pipeline.js --clean   ← Solo limpia datos de prueba
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const crypto = require('crypto');
const prisma = require('../src/config/database'); // Esta línea ya existe

// ─── Constantes de Prueba ─────────────────────────────────────────────────────

const TEST_NOMBRE_AGENTE    = '[TEST-BINA4] Agente de Prueba IA';
const TEST_PROMPT_SISTEMA   = `Eres un asistente virtual de atención al cliente para un hotel boutique.
Responde siempre en español, de forma amable y concisa (máximo 2 oraciones).
Tu objetivo es informar al cliente sobre horarios, servicios y disponibilidad.`;
const TEST_TRANSCRIPCION    = 'Hola, quiero saber a qué hora abren el hotel y si tienen desayuno incluido.';

// ─── Helpers de Output ────────────────────────────────────────────────────────

const log  = (msg) => console.log(`\n✅ ${msg}`);
const warn = (msg) => console.log(`\n⚠️  ${msg}`);
const info = (msg) => console.log(`   ℹ️  ${msg}`);
const sep  = ()    => console.log('\n' + '─'.repeat(70));

// ─── Limpieza de Datos de Prueba ──────────────────────────────────────────────

/**
 * Elimina todos los registros creados por ejecuciones anteriores de este script.
 * Sigue el orden correcto de FK para evitar errores de constraint.
 */
async function limpiarDatosPrueba() {
  console.log('\n🧹 Limpiando datos de prueba anteriores...');

  // Encontrar agentes de prueba para cascada
  const agentesPrueba = await prisma.agentes_virtuales.findMany({
    where: { nombre: TEST_NOMBRE_AGENTE },
    select: { id: true }
  });

  const agentesIds = agentesPrueba.map(a => a.id);

  if (agentesIds.length === 0) {
    info('No había datos de prueba previos.');
    return;
  }

  // Eliminar en orden de dependencias (FK)
  const jobsBorrados = await prisma.jobs_async.deleteMany({
    where: {
      payload: { path: ['_test_bina4'], equals: true }
    }
  });

  const llamadasBorradas = await prisma.llamadas.deleteMany({
    where: { agente_id: { in: agentesIds } }
  });

  // versiones_prompt se borra en cascada con agentes_virtuales
  const agentesBorrados = await prisma.agentes_virtuales.deleteMany({
    where: { id: { in: agentesIds } }
  });

  info(`Jobs eliminados:    ${jobsBorrados.count}`);
  info(`Llamadas eliminadas: ${llamadasBorradas.count}`);
  info(`Agentes eliminados:  ${agentesBorrados.count}`);
  log('Limpieza completada.');
}

// ─── Verificaciones Previas ───────────────────────────────────────────────────

/**
 * Busca la primera empresa disponible en la BD.
 * @throws {Error} Si no existe ninguna empresa
 */
async function encontrarEmpresa() {
  const empresa = await prisma.empresas.findFirst({
    where:  { deleted_at: null },
    select: { id: true, nombre_comercial: true }
  });

  if (!empresa) {
    throw new Error(
      'No existe ninguna empresa en la BD local. ' +
      'Crea una empresa primero (via Bina 1 o seed SQL) y vuelve a ejecutar.'
    );
  }

  log(`Empresa encontrada: "${empresa.nombre_comercial}" (${empresa.id})`);
  return empresa;
}

/**
 * Verifica que la empresa tiene configuraciones_ia con openai_api_key.
 * @throws {Error} Si no están configuradas las credenciales IA
 */
async function verificarConfiguracionIA(empresaId) {
  const config = await prisma.configuraciones_empresa.findUnique({
    where:  { empresa_id: empresaId },
    select: { credenciales_ia: true, modelo_ia: true }
  });

  if (!config?.credenciales_ia?.openai_api_key) {
    throw new Error(
      `La empresa ${empresaId} no tiene 'openai_api_key' en ` +
      `configuraciones_empresa.credenciales_ia. ` +
      `Configúrala antes de correr el pipeline IA:\n` +
      `  UPDATE configuraciones_empresa\n` +
      `  SET credenciales_ia = '{"openai_api_key": "sk-proj-..."}'\n` +
      `  WHERE empresa_id = '${empresaId}';`
    );
  }

  log(`Configuración IA OK: modelo = ${config.modelo_ia ?? 'gpt-4o (default)'}`);
  return config;
}

/**
 * Busca el primer usuario activo de la empresa (requerido por versiones_prompt.usuario_id).
 * @throws {Error} Si no existe ningún usuario en la empresa
 */
async function encontrarUsuario(empresaId) {
  const usuario = await prisma.usuarios.findFirst({
    where:  { empresa_id: empresaId, deleted_at: null },
    select: { id: true, nombre: true, correo: true }
  });

  if (!usuario) {
    throw new Error(
      `No existe ningún usuario para la empresa ${empresaId}. ` +
      `Crea un usuario primero (via módulo de Bina 1) y vuelve a ejecutar.`
    );
  }

  log(`Usuario encontrado: "${usuario.nombre}" (${usuario.correo})`);
  return usuario;
}

// ─── Creación de Datos de Prueba ──────────────────────────────────────────────

/**
 * Crea el agente virtual de prueba.
 * Campos opcionales (tipo_agente_id, estado_agente_id, etc.) se dejan null
 * para mantener el script independiente de datos de catálogo.
 */
async function crearAgentePrueba(empresaId) {
  const agente = await prisma.agentes_virtuales.create({
    data: {
      id:          crypto.randomUUID(),
      empresa_id:  empresaId,
      nombre:      TEST_NOMBRE_AGENTE,
      descripcion: 'Agente temporal creado por el script de pruebas de Bina 4. Eliminar al finalizar QA.'
    },
    select: { id: true, nombre: true }
  });

  log(`Agente de prueba creado: "${agente.nombre}" (${agente.id})`);
  return agente;
}

/**
 * Crea el prompt de sistema activo para el agente de prueba.
 * versiones_prompt requiere usuario_id (NOT NULL) — usamos el usuario encontrado.
 */
async function crearVersionPrompt(agenteId, usuarioId) {
  const prompt = await prisma.versiones_prompt.create({
    data: {
      agente_virtual_id: agenteId,
      id:                crypto.randomUUID(),
      usuario_id:        usuarioId,
      version:           1,
      prompt:            TEST_PROMPT_SISTEMA,
      descripcion_cambio: 'Prompt inicial de prueba — script test-ia-pipeline.js',
      es_activa:         true
    },
    select: { id: true, version: true, es_activa: true }
  });

  log(`Prompt de sistema creado: v${prompt.version}, es_activa=${prompt.es_activa}`);
  info(`Primeras 80 chars: "${TEST_PROMPT_SISTEMA.slice(0, 80)}..."`);
  return prompt;
}

/**
 * Crea la llamada de prueba.
 *
 * NOTA SOBRE pbx_call_id:
 *   Se deja null intencionalmente. El TTS Worker tiene un FAIL-FAST que aborta
 *   la síntesis si pbx_call_id es null (indicando que el usuario colgó).
 *   Esto valida correctamente el comportamiento del pipeline en local sin UCM.
 *   Para probar la síntesis TTS real, cambiar a pbx_call_id: 'test-ch-001'
 *   (fallará en uploadPrompt pero ejecutará la síntesis OpenAI).
 */
async function crearLlamadaPrueba(empresaId, agenteId) {
  const llamada = await prisma.llamadas.create({
    data: {
      id:          crypto.randomUUID(),
      empresa_id:    empresaId,
      agente_id:     agenteId,
      pbx_call_id:   null,          // null = TTS FAIL-FAST limpio (sin costo de tokens TTS)
      numero_origen: '+5213312345678',
      transcripcion: TEST_TRANSCRIPCION,
      stt_estado:    'completado',  // Simulamos que el STT ya completó
      fecha_inicio:  new Date()
    },
    select: { id: true, transcripcion: true, pbx_call_id: true }
  });

  log(`Llamada de prueba creada: (${llamada.id})`);
  info(`transcripcion: "${llamada.transcripcion}"`);
  info(`pbx_call_id:   ${llamada.pbx_call_id ?? 'null (TTS FAIL-FAST esperado)'}`);
  return llamada;
}

/**
 * Inserta el job 'procesar_llm' en jobs_async para despertar el Daemon LLM.
 *
 * OMITIMOS el job 'transcribir_audio' (STT) porque requiere un archivo de
 * audio real en CloudUCM. En su lugar, ya pusimos la 'transcripcion' directamente
 * en 'llamadas' y arrancamos el pipeline desde el paso LLM.
 *
 * El campo '_test_bina4: true' en el payload sirve para identificar y limpiar
 * este registro en ejecuciones futuras del script con --clean.
 */
async function insertarJobLLM(empresaId, llamadaId) {
  const job = await prisma.jobs_async.create({
    data: {
      id:          crypto.randomUUID(),
      empresa_id:       empresaId,
      tipo:             'procesar_llm',
      payload:          {
        llamada_id:    llamadaId,
        proveedor_id:  null,      // null = usa default de configuraciones_empresa
        _test_bina4:   true       // marcador para limpieza automática
      },
      fecha_programada: new Date()
    },
    select: { id: true, tipo: true, status: true }
  });

  log(`Job insertado en cola: tipo='${job.tipo}', status='${job.status}' (${job.id})`);
  return job;
}

// ─── Instrucciones Finales ────────────────────────────────────────────────────

function imprimirInstrucciones(llamadaId, empresaId) {
  sep();
  console.log(`
🚀 PIPELINE LISTO — Esperando que los Daemons procesen los jobs

Los workers de Bina 4 (llmProceso, ttsProceso) están sondeando jobs_async
cada 5 segundos. En los próximos 5-30 segundos verás en los logs del servidor:

  PASO 1 ─ LLM Worker detecta el job 'procesar_llm':
    [LLM Job][llm-worker-...] ▶ Iniciando job ... | llamada: ${llamadaId}
    [LLM Job][llm-worker-...] 🤖 Llamando al LLM (modelo: gpt-4o, ...)
    [LLM Job][llm-worker-...] ✅ LLM OK | tokens in/out: XXX/XXX
    [LLM Job][llm-worker-...] ✔ Job completado

  PASO 2 ─ LLM Worker inserta job 'procesar_tts' (self-chaining):
    (el TTS job aparece automáticamente en jobs_async)

  PASO 3 ─ TTS Worker detecta el job 'procesar_tts':
    [TTS Job][tts-worker-...] ▶ Iniciando job ... | llamada: ${llamadaId}
    [TTS Job][tts-worker-...] ❌ Error: La llamada ... no tiene pbx_call_id
    (ESPERADO ✅ — no hay UCM local. El FAIL-FAST ahorró tokens TTS.)

  VALIDACIÓN en Prisma Studio (npx prisma studio):
    llamadas          → respuesta_ia='...', llm_estado='completado', tts_estado='error'
    auditorias_comandos_ia → registro con comando_voz_puro y respuesta_ia_puro
    consumo_ia        → registro con tokens_entrada, tokens_salida, costo_estimado (LLM)

  ID de llamada para filtrar: ${llamadaId}
  Empresa ID:                  ${empresaId}
`);
  sep();
  console.log('Para limpiar los datos de prueba al terminar:');
  console.log('  node scripts/test-ia-pipeline.js --clean\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args   = process.argv.slice(2);
  const limpiar = args.includes('--clean');

  sep();
  console.log('🧪 Script de Prueba del Pipeline IA — Bina #4 (Johann & Kevin)');
  sep();

  try {
    // Modo limpieza: solo elimina datos sin crear nuevos
    if (limpiar) {
      await limpiarDatosPrueba();
      console.log('\n✅ Limpieza completada. BD en estado limpio.\n');
      return;
    }

    // — Fase 0: Limpiar corridas anteriores —
    await limpiarDatosPrueba();

    // — Fase 1: Verificaciones previas —
    sep();
    console.log('📋 Fase 1: Verificando prerequisitos...');
    const empresa = await encontrarEmpresa();
    await verificarConfiguracionIA(empresa.id);
    const usuario = await encontrarUsuario(empresa.id);

    // — Fase 2: Crear datos de prueba —
    sep();
    console.log('🏗️  Fase 2: Creando datos de prueba...');
    const agente  = await crearAgentePrueba(empresa.id);
    await crearVersionPrompt(agente.id, usuario.id);
    const llamada = await crearLlamadaPrueba(empresa.id, agente.id);

    // — Fase 3: Disparar el pipeline LLM —
    sep();
    console.log('⚡ Fase 3: Insertando job en la cola...');
    await insertarJobLLM(empresa.id, llamada.id);

    // — Fase 4: Instrucciones de monitoreo —
    imprimirInstrucciones(llamada.id, empresa.id);

  } catch (err) {
    console.error(`\n❌ ERROR: ${err.message}\n`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
