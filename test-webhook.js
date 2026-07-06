// test-webhook.js
// ══════════════════════════════════════════════════════════════════════════════
// SERVIDOR DE PRUEBA — Validación del IVR Webhook de CloudUCM
// ══════════════════════════════════════════════════════════════════════════════
//
// PROPÓSITO:
//   Capturar el JSON exacto que CloudUCM manda a MERCI durante una llamada real.
//   Sin esta información, callOrchestrator.service.js no se puede implementar.
//
// CÓMO EJECUTAR:
//   1. Desde la raíz del proyecto:  node test-webhook.js
//   2. En otra terminal:            ngrok http 4000
//   3. Copiar la URL de ngrok (ej: https://abc123.ngrok.io)
//   4. En CloudUCM: configurar esa URL + /webhooks/pbx como webhook del IVR
//   5. Hacer una llamada real a la extensión configurada (ej: extensión 7099)
//   6. Ver en esta terminal el JSON exacto que mandó CloudUCM
//   7. Compartir los logs con el equipo para implementar callOrchestrator
//
// QUÉ RESPONDE:
//   Responde con { "action": "play_prompt", "prompt_id": "welcome" } para
//   que CloudUCM no se quede colgado esperando respuesta.
//   Si eso hace que CloudUCM mande un segundo webhook, mejor — así vemos
//   el flujo completo (call_started → client_spoke → etc.).
//
// DEPENDENCIAS: solo express (ya está en el proyecto)
// ══════════════════════════════════════════════════════════════════════════════

const express    = require('express');
const bodyParser = require('body-parser');

const app  = express();
const PORT = 4000;

// Contador global para numerar cada request y facilitar la lectura de los logs
let requestCount = 0;

// ── Parsers ───────────────────────────────────────────────────────────────────
// Acepta JSON y también form-urlencoded por si CloudUCM usa ese formato
app.use(bodyParser.json({ type: '*/*' }));       // Intenta parsear todo como JSON
app.use(bodyParser.urlencoded({ extended: true })); // Fallback: form-data
app.use(bodyParser.text({ type: '*/*' }));          // Fallback: texto plano

// ── Middleware de logging global ──────────────────────────────────────────────
// Captura TODAS las requests antes de llegar a cualquier ruta,
// así no perdemos nada aunque CloudUCM mande a una URL diferente.
app.use((req, res, next) => {
    requestCount++;
    const num       = requestCount;
    const timestamp = new Date().toISOString();

    // Línea separadora para distinguir cada evento en la terminal
    console.log('\n' + '═'.repeat(60));
    console.log(`  REQUEST #${num}`);
    console.log('═'.repeat(60));
    console.log(`  Timestamp : ${timestamp}`);
    console.log(`  Método    : ${req.method}`);
    console.log(`  URL       : ${req.originalUrl}`);

    // Headers — los imprimimos todos para detectar autenticación, content-type, etc.
    console.log('\n  ── HEADERS ──────────────────────────────────────────');
    Object.entries(req.headers).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
    });

    // Query params (por si CloudUCM manda datos en la URL)
    if (Object.keys(req.query).length > 0) {
        console.log('\n  ── QUERY PARAMS ─────────────────────────────────────');
        console.log('  ', JSON.stringify(req.query, null, 2));
    }

    // Body — este es el dato más importante: el JSON exacto de CloudUCM
    console.log('\n  ── BODY ─────────────────────────────────────────────');
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        console.log(JSON.stringify(req.body, null, 2)
            .split('\n')
            .map(line => '  ' + line)
            .join('\n')
        );
    } else if (req.body && typeof req.body === 'string' && req.body.length > 0) {
        console.log('  (string raw):', req.body);
    } else {
        console.log('  (body vacío o no parseado)');
    }

    console.log('═'.repeat(60) + '\n');

    // Adjuntar metadata al request para que las rutas la puedan usar
    req._logNum    = num;
    req._timestamp = timestamp;

    next();
});

// ── GET /health ───────────────────────────────────────────────────────────────
// Útil para confirmar que el servidor está levantado antes de configurar ngrok
app.get('/health', (req, res) => {
    res.json({ status: 'ok', port: PORT, requests: requestCount });
});

// ── POST /webhooks/pbx ────────────────────────────────────────────────────────
// Endpoint principal que CloudUCM va a llamar durante la llamada de prueba.
//
// RESPUESTA: simulamos una instrucción válida para que CloudUCM no se cuelgue.
// Si esto hace que CloudUCM mande un segundo webhook, mejor — así vemos el
// flujo completo. Si CloudUCM ignora la respuesta, también lo sabremos.
app.post('/webhooks/pbx', (req, res) => {
    const respuesta = {
        action:    'play_prompt',
        prompt_id: 'welcome'
    };

    console.log(`  ↩ Respondiendo al REQUEST #${req._logNum} con:`);
    console.log('  ', JSON.stringify(respuesta));
    console.log('');

    // Algunos PBX esperan 200, otros aceptan 204.
    // Respondemos 200 con body para maximizar compatibilidad.
    res.status(200).json(respuesta);
});

// ── Catch-all para cualquier otra ruta ───────────────────────────────────────
// CloudUCM podría mandar a /webhooks/call, /api/ivr, etc.
// Capturamos cualquier ruta para no perder eventos inesperados.
app.all('*', (req, res) => {
    console.log(`  ⚠ Ruta no esperada: ${req.method} ${req.originalUrl}`);
    console.log('  Respondiendo 200 igual para no bloquear a CloudUCM.\n');
    res.status(200).json({ received: true });
});

// ── Arrancar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║         SERVIDOR DE PRUEBA MERCI — CloudUCM Webhook      ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Local:   http://localhost:${PORT}                          ║`);
    console.log('║  Health:  http://localhost:' + PORT + '/health                     ║');
    console.log('║  Webhook: http://localhost:' + PORT + '/webhooks/pbx              ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║  PRÓXIMOS PASOS:                                         ║');
    console.log('║  1. Abre otra terminal                                   ║');
    console.log('║  2. Ejecuta: ngrok http 4000                             ║');
    console.log('║  3. Copia la URL https://xxxx.ngrok.io                  ║');
    console.log('║  4. Configura en CloudUCM: URL + /webhooks/pbx          ║');
    console.log('║  5. Haz una llamada a la extensión 7099                  ║');
    console.log('║  6. Los logs aparecen aquí abajo en tiempo real          ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('  Esperando requests de CloudUCM...');
    console.log('');
});