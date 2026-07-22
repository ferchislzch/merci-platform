const CloudUCMProvider = require('./src/services/pbx/CloudUCMProvider');
const prisma = require('./src/config/database');

(async () => {
    const cfg = await prisma.configuraciones_pbx.findFirst({ where: { activo: true, deleted_at: null } });
    if (!cfg) { console.error('No hay configuraciones_pbx. Corre el Paso 1.2.'); process.exit(1); }
    const ucm = new CloudUCMProvider();
    try {
        const login = await ucm.connect(cfg.empresa_id);
        console.log('LOGIN:', login.status, '(status 0 = ÉXITO)');

        const ext = await ucm.getExtensions(cfg.empresa_id);
        console.log('EXTENSIONES TOTAL:', ext.total);
        console.log('MUESTRA:', JSON.stringify(ext.extensiones.slice(0, 5), null, 2));

        const cdr = await ucm.getCDR(cfg.empresa_id, { numRecords: 5 });
        console.log('CDR:', JSON.stringify(cdr, null, 2));
    } catch (e) {
        console.error('FALLO:', e.message);
    } finally {
        process.exit(0);
    }
})();