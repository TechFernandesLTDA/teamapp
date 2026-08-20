import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { prisma } from './db.js'
import { addClient, clientCount } from './bus.js'
import { boardRoutes } from './routes/board.js'
import { listRoutes } from './routes/lists.js'
import { cardRoutes } from './routes/cards.js'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

const app = Fastify({ logger: true })

await app.register(cors, {
  // O browser fala direto com a API, sem proxy reverso -- ver CLAUDE.md.
  origin: [
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:8090',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8090',
  ],
})
await app.register(websocket)

await app.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket) => {
    addClient(socket)
    instance.log.info({ clients: clientCount() }, 'websocket conectado')
  })
})

await app.register(boardRoutes)
await app.register(listRoutes)
await app.register(cardRoutes)

app.setErrorHandler((error: FastifyError, _req, reply) => {
  app.log.error(error)
  const status = typeof error.statusCode === 'number' ? error.statusCode : 500
  reply.code(status).send({ error: error.message || 'erro interno' })
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  })
}

try {
  await app.listen({ port: PORT, host: HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
