// test-challenge.js — SOLO hace el challenge, NO intenta login (no gasta intentos)
const axios = require('axios');
const https = require('https');
const prisma = require('./src/config/database');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

(async () => {
    const cfg = await prisma.configuraciones_pbx.findFirst({ where: { activo: true, deleted_at: null } });
    const baseUrl = cfg.api_url.replace(/\/$/, '');
    console.log('URL:', baseUrl, '| usuario:', cfg.api_usuario);
    try {
        const res = await axios.get(`${baseUrl}/cgi`, {
        params: { action: 'challenge', user: cfg.api_usuario },
        httpsAgent,
        });
        console.log('--- RESPUESTA CRUDA DEL CHALLENGE ---');
        console.log(JSON.stringify(res.data, null, 2));
        console.log('-------------------------------------');
        console.log('challenge en response.challenge :', res.data?.response?.challenge ?? 'undefined');
        console.log('challenge en data.challenge     :', res.data?.challenge ?? 'undefined');
    } catch (e) {
        console.log('ERROR en challenge:', e.response?.status, JSON.stringify(e.response?.data ?? e.message));
    } finally {
        process.exit(0);
    }
})();