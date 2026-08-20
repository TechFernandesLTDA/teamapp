import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'

export async function boardRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ status: 'ok' }))

  app.get('/api/board', async (_req, reply) => {
    const board = await prisma.board.findUnique({
      where: { slug: 'default' },
      include: {
        lists: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: { cards: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
        },
      },
    })

    if (!board) {
      return reply.code(404).send({ error: 'board default nao existe -- rode o seed' })
    }
    return board
  })
}
