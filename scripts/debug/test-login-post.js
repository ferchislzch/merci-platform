// test-login-post.js — Prueba el login con el formato OFICIAL (POST + JSON a /api)
// en vez del estilo legacy (GET a /cgi) que usa CloudUCMProvider actualmente.
const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const prisma = require('./src/config/database');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const md5 = (v) => crypto.createHash('md5').update(v).digest('hex');

(async () => {
    const cfg = await prisma.configuraciones_pbx.findFirst({ where: { activo: true, deleted_at: null } });
    const baseUrl = cfg.api_url.replace(/\/$/, '');
    const usuario = cfg.api_usuario;
    const password = cfg.credenciales?.password;
    console.log('URL:', baseUrl, '| usuario:', usuario);

    // Paso 1: challenge — POST + JSON a /api (formato oficial), con version
    const challengeRes = await axios.post(`${baseUrl}/api`,
        { request: { action: 'challenge', user: usuario, version: '1.0' } },
        { httpsAgent }
    );
    console.log('CHALLENGE (POST /api):', JSON.stringify(challengeRes.data));

    const challenge = challengeRes.data?.response?.challenge;
    if (!challenge) {
        console.log('No se obtuvo challenge por /api. Abortando sin intentar login.');
        process.exit(0);
    }

    const token = md5(challenge + password);

    // Paso 2: login — POST + JSON a /api (formato oficial)
    const loginRes = await axios.post(`${baseUrl}/api`,
        { request: { action: 'login', user: usuario, token } },
        { httpsAgent }
    );
    console.log('LOGIN (POST /api):', JSON.stringify(loginRes.data));
    process.exit(0);
})();