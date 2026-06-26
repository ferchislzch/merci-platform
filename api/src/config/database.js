// src/config/database.js
const { PrismaClient } = require('../../generated/prisma')
const { PrismaPg } = require('@prisma/adapter-pg')
const env = require('./env')

// Prisma 7 requiere un adapter explícito para conectar con PostgreSQL
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

// Singleton — una sola instancia en todo el servidor
const prisma = new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
})

module.exports = prisma