const express = require('express')
const cors = require('cors')
const env = require('./config/env')
const errorHandler = require('./core/middlewares/error.middleware')
const { generalLimiter } = require('./core/middlewares/rateLimiter.middleware')
const indexRoutes  = require('./routes/index.routes')

const app = express()

// ─── Middlewares globales 
app.use(cors({
    origin: env.WS_CORS_ORIGIN,
    credentials: true,
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(generalLimiter)

// ─── Rutas 
app.use('/api', indexRoutes)

// Health check
app.get('/health', (req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() })
})

// 404
app.use((req, res) => {
    res.status(404).json({ ok: false, mensaje: 'Ruta no encontrada' })
})

// Error handler global — siempre al final
app.use(errorHandler)

module.exports = app