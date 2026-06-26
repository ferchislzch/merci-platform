const http = require('http')
const app = require('./app')
const env = require('./config/env')
const { initSocket } = require('./config/socket')
const worker = require('./services/worker.service')

const PORT   = parseInt(env.PORT) || 3000
const server = http.createServer(app)

// Inicializar socket.io
initSocket(server)

// Arrancar worker de jobs_async
worker.start()

server.listen(PORT, () => {
    console.log(`[server] MERCI backend corriendo en puerto ${PORT}`)
    console.log(`[server] Entorno: ${env.NODE_ENV}`)
    console.log(`[server] Health: http://localhost:${PORT}/health`)
})

// Apagado limpio
const shutdown = () => {
    console.log('[server] Apagando...')
    worker.stop()
    server.close(() => process.exit(0))
}

process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)

module.exports = server