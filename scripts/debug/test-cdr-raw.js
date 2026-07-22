// test-cdr-raw.js — Muestra los últimos registros crudos con fecha y recordfiles
const CloudUCMProvider = require('./src/services/pbx/CloudUCMProvider');
const prisma = require('./src/config/database');

(async () => {
    const cfg = await prisma.configuraciones_pbx.findFirst({ where: { activo: true, deleted_at: null } });
    const ucm = new CloudUCMProvider();
    await ucm.connect(cfg.empresa_id);

    const cdr = await ucm.getCDR(cfg.empresa_id, { numRecords: 10 });
    const registros = (cdr.registros || [])
        .filter(r => r.start) // descarta los "main_cdr" compuestos sin start
        .sort((a, b) => new Date(b.start) - new Date(a.start));

    console.log(`Hora actual: ${new Date().toISOString()}`);
    console.log('--- Últimos 5 registros (más reciente primero) ---');
    registros.slice(0, 5).forEach(r => {
        console.log({
        start: r.start,
        duration: r.duration,
        disposition: r.disposition,
        action_type: r.action_type,
        lastapp: r.lastapp,
        recordfiles: r.recordfiles === '' ? '(vacío)' : r.recordfiles,
        });
    });
    process.exit(0);
})();