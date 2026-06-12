const { Server } = require('socket.io')
const env = require('./env')

let io = null

// Inicializar socket.io sobre el servidor HTTP
// Se llama una sola vez desde server.js
const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
        origin: env.WS_CORS_ORIGIN,
        methods: ['GET', 'POST'],
        },
    })

    io.on('connection', (socket) => {
        // El cliente debe enviar su empresa_id al conectarse
        // para unirse a su room privada
        socket.on('join:empresa', (empresaId) => {
        if (empresaId) {
            socket.join(`empresa:${empresaId}`)
        }
        })

        socket.on('disconnect', () => {})
    })

    return io
}

// Devuelve la instancia activa de io
// Se usa en websocket.service.js para emitir eventos
const getIO = () => {
    if (!io) throw new Error('Socket.io no ha sido inicializado')
    return io
}

module.exports = { initSocket, getIO }