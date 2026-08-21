import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { broadcast } from '../bus.js'
import { ALIVE, broadcastTrash, findLiveList } from '../trash.js'

export async function listRoutes(app: FastifyInstance) {
  app.post('/api/lists', async (req, reply) => {
    const { title } = (req.body ?? {}) as { title?: unknown }
    if (typeof title !== 'string' || !title.trim()) {
      return reply.code(400).send({ error: 'title e obrigatorio' })
    }

    const board = await prisma.board.findUnique({ where: { slug: 'default' } })
    if (!board) return reply.code(404).send({ error: 'board default nao existe' })

    // Inclui as listas na lixeira: uma lista restaurada nao deve colidir de
    // position com uma criada enquanto ela estava fora.
    const last = await prisma.list.findFirst({
      where: { boardId: board.id },
      orderBy: { position: 'desc' },
    })

    const list = await prisma.list.create({
      data: {
        title: title.trim(),
        position: last ? last.position + 1 : 0,
        boardId: board.id,
      },
      include: { cards: true },
    })

    broadcast('list.created', list)
    return reply.code(201).send(list)
  })

  app.patch('/api/lists/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { title, position } = (req.body ?? {}) as { title?: unknown; position?: unknown }

    const data: { title?: string; position?: number } = {}
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return reply.code(400).send({ error: 'title deve ser uma string nao vazia' })
      }
      data.title = title.trim()
    }
    if (position !== undefined) {
      if (typeof position !== 'number' || !Number.isFinite(position)) {
        return reply.code(400).send({ error: 'position deve ser um numero' })
      }
      data.position = position
    }
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'nada para atualizar' })
    }

    const exists = await findLiveList(id)
    if (!exists) return reply.code(404).send({ error: 'lista nao encontrada' })

    const list = await prisma.list.update({
      where: { id },
      data,
      include: { cards: { where: ALIVE, orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    })

    broadcast('list.updated', list)
    return list
  })

  app.delete('/api/lists/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const exists = await findLiveList(id)
    if (!exists) return reply.code(404).send({ error: 'lista nao encontrada' })

    // Soft delete. Os cards da lista NAO sao marcados: eles somem do board junto
    // com ela e voltam junto na restauracao. Marcar em cascata faria um card que
    // ja tinha ido para a lixeira sozinho ressuscitar quando a lista voltasse.
    await prisma.list.update({ where: { id }, data: { deletedAt: new Date() } })

    broadcast('list.deleted', { id })
    await broadcastTrash()
    return reply.code(204).send()
  })
}
