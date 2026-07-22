// test-recording.js — Verifica si recordfiles se llena en el CDR y prueba recapi
const CloudUCMProvider = require('./src/services/pbx/CloudUCMProvider');
const prisma = require('./src/config/database');
const fs = require('fs');

(async () => {
    const cfg = await prisma.configuraciones_pbx.findFirst({ where: { activo: true, deleted_at: null } });
    const ucm = new CloudUCMProvider();
    await ucm.connect(cfg.empresa_id);

    const cdr = await ucm.getCDR(cfg.empresa_id, { numRecords: 10 });
    const registros = cdr.registros || [];

    console.log(`Total registros CDR: ${registros.length}`);

    // Buscar el registro más reciente CON grabación
    const conGrabacion = registros
        .filter(r => r.recordfiles && r.recordfiles.trim() !== '')
        .sort((a, b) => new Date(b.start) - new Date(a.start));

    if (conGrabacion.length === 0) {
        console.log('Ningún registro trae "recordfiles" con valor. Revisa que Auto Record haya quedado activo y que la llamada de prueba haya durado más de unos segundos.');
        process.exit(0);
    }

    const ultimo = conGrabacion[0];
    console.log('recordfiles SÍ se llena. Registro más reciente con grabación:');
    console.log(JSON.stringify(ultimo, null, 2));

    const nombreArchivo = ultimo.recordfiles;
    console.log(`\nProbando recapi con filename="${nombreArchivo}" ...`);

    // Probar recapi con el formato oficial: filename (+ filedir opcional)
    const axios = require('axios');
    const https = require('https');
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    try {
        const res = await axios.post(
        `${cfg.api_url.replace(/\/$/, '')}/api`,
        { request: { action: 'recapi', cookie: ucm.cookie, filename: nombreArchivo } },
        { httpsAgent, responseType: 'arraybuffer' }
        );
        const contentType = res.headers['content-type'] || '';
        console.log('Content-Type de la respuesta:', contentType);
        console.log('Tamaño recibido:', res.data.length, 'bytes');

        if (contentType.includes('json')) {
        console.log('CloudUCM devolvió JSON (probablemente error):', Buffer.from(res.data).toString());
        } else {
        fs.writeFileSync('./grabacion-prueba.wav', res.data);
        console.log('Guardado como grabacion-prueba.wav — ábrelo para confirmar que es audio real.');
        }
    } catch (e) {
        console.log('Error en recapi:', e.response?.status, e.response?.data ? Buffer.from(e.response.data).toString() : e.message);
    }

    process.exit(0);
})();