import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { ALIVE, trashCounts } from '../trash.js'

export async function boardRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ status: 'ok' }))

  app.get('/api/board', async (_req, reply) => {
    // O board so enxerga o que nao esta na lixeira. Os DOIS filtros importam:
    // sem o de dentro, um card jogado fora continua aparecendo na lista dele.
    const board = await prisma.board.findUnique({
      where: { slug: 'default' },
      include: {
        lists: {
          where: ALIVE,
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: {
            cards: { where: ALIVE, orderBy: [{ position: 'asc' }, { id: 'asc' }] },
          },
        },
      },
    })

    if (!board) {
      return reply.code(404).send({ error: 'board default nao existe -- rode o seed' })
    }
    // A contagem da lixeira vem junto para o icone ja nascer no estado certo, sem
    // precisar de um GET /api/trash so para saber se ela esta vazia.
    return { ...board, trash: await trashCounts() }
  })
}
