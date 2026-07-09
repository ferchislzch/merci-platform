const express = require('express')
const router  = express.Router()

// ─── Bina 1
const authRoutes          = require('../modules/auth/auth.routes')
const usuariosRoutes      = require('../modules/usuarios/usuarios.routes')
const rolesRoutes         = require('../modules/roles/roles.routes')
const empresasRoutes      = require('../modules/empresas/empresas.routes')
const sucursalesRoutes    = require('../modules/sucursales/sucursales.routes')
// const empresasRoutes      = require('../modules/empresas/empresas.routes')

// ─── Bina 2
const agentesRoutes       = require('../modules/agentes/agentes.routes')  
const workflowsRoutes     = require('../modules/workflows/workflows.routes')

// ─── Bina 3
// const llamadasRoutes      = require('../modules/llamadas/llamadas.routes')
// const webhooksRoutes      = require('../modules/webhooks/webhooks.routes')

// ─── Complementarios
// const ticketsRoutes       = require('../modules/tickets/tickets.routes')
// const dashboardRoutes     = require('../modules/dashboard/dashboard.routes')
// const conocimientoRoutes  = require('../modules/conocimiento/conocimiento.routes')
// const configuracionRoutes = require('../modules/configuracion/configuracion.routes')
// const sucursalesRoutes    = require('../modules/sucursales/sucursales.routes')
// const pmsRoutes           = require('../modules/pms/pms.routes')

// ─── Registro
router.use('/auth',           authRoutes)
router.use('/usuarios',       usuariosRoutes)
router.use('/roles',          rolesRoutes)
router.use('/admin/empresas', empresasRoutes)
router.use('/sucursales',     sucursalesRoutes)
// router.use('/roles',          rolesRoutes)
// router.use('/admin/empresas', empresasRoutes)
router.use('/agentes',        agentesRoutes)
router.use('/workflows',      workflowsRoutes)
// router.use('/llamadas',       llamadasRoutes)
// router.use('/webhooks',       webhooksRoutes)
// router.use('/tickets',        ticketsRoutes)
// router.use('/dashboard',      dashboardRoutes)
// router.use('/documentos',     conocimientoRoutes)
// router.use('/configuracion',  configuracionRoutes)
// router.use('/sucursales',     sucursalesRoutes)
// router.use('/api/v1',         pmsRoutes)

// Status
router.get('/status', (req, res) => {
  res.json({ ok: true, mensaje: 'API MERCI operativa', version: 'v1' })
})

module.exports = router