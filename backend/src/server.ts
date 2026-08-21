import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { prisma } from './db.js'
import { addClient, clientCount } from './bus.js'
import { boardRoutes } from './routes/board.js'
import { listRoutes } from './routes/lists.js'
import { cardRoutes } from './routes/cards.js'
import { trashRoutes } from './routes/trash.js'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

const app = Fastify({ logger: true })

// O browser fala direto com a API, sem proxy reverso -- ver CLAUDE.md.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:8090',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8090',
]

await app.register(cors, {
  origin: ALLOWED_ORIGINS,
  // OBRIGATORIO declarar: o default do @fastify/cors e 'GET,HEAD,POST', que
  // reprova PATCH e DELETE no preflight -- ou seja, mata o drag-and-drop, o
  // rename e o delete inteiros no browser. curl nao aplica CORS, entao o smoke
  // test passa mesmo com isso quebrado; so o browser reclama.
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
})
await app.register(websocket)

await app.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket, req) => {
    // O REST filtra origem via CORS; o WS nao herda isso -- sem esta checagem
    // qualquer site consegue ler todo o trafego de mutacao do board.
    const origin = req.headers.origin
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      instance.log.warn({ origin }, 'websocket recusado: origem nao permitida')
      socket.close(1008, 'origem nao permitida')
      return
    }

    addClient(socket)
    instance.log.info({ clients: clientCount() }, 'websocket conectado')
  })
})

// Envelope unico de erro: docs/API.md promete { error } em TODA falha.
// O setErrorHandler sozinho nao cobre erros pre-rota (JSON malformado, payload
// grande demais) nem o 404 do router -- esses vem no envelope proprio do Fastify
// ({statusCode, code, error, message}), e o cliente le `.error` e mostra
// "Bad Request" em vez da mensagem util.
app.setErrorHandler((error: FastifyError, _req, reply) => {
  app.log.error(error)
  const status = typeof error.statusCode === 'number' ? error.statusCode : 500
  reply.code(status).send({ error: error.message || 'erro interno' })
})

app.setNotFoundHandler((req, reply) => {
  reply.code(404).send({ error: `rota nao encontrada: ${req.method} ${req.url}` })
})

await app.register(boardRoutes)
await app.register(listRoutes)
await app.register(cardRoutes)
await app.register(trashRoutes)

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
