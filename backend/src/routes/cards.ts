import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { broadcast } from '../bus.js'

export async function cardRoutes(app: FastifyInstance) {
  app.post('/api/cards', async (req, reply) => {
    const { listId, title, description } = (req.body ?? {}) as {
      listId?: unknown
      title?: unknown
      description?: unknown
    }

    if (typeof listId !== 'string' || !listId) {
      return reply.code(400).send({ error: 'listId e obrigatorio' })
    }
    if (typeof title !== 'string' || !title.trim()) {
      return reply.code(400).send({ error: 'title e obrigatorio' })
    }
    if (description !== undefined && typeof description !== 'string') {
      return reply.code(400).send({ error: 'description deve ser uma string' })
    }

    const list = await prisma.list.findUnique({ where: { id: listId } })
    if (!list) return reply.code(404).send({ error: 'lista nao encontrada' })

    const last = await prisma.card.findFirst({
      where: { listId },
      orderBy: { position: 'desc' },
    })

    const card = await prisma.card.create({
      data: {
        listId,
        title: title.trim(),
        description: description ?? '',
        position: last ? last.position + 1 : 0,
      },
    })

    broadcast('card.created', card)
    return reply.code(201).send(card)
  })

  app.patch('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { title, description } = (req.body ?? {}) as {
      title?: unknown
      description?: unknown
    }

    const data: { title?: string; description?: string } = {}
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return reply.code(400).send({ error: 'title deve ser uma string nao vazia' })
      }
      data.title = title.trim()
    }
    if (description !== undefined) {
      if (typeof description !== 'string') {
        return reply.code(400).send({ error: 'description deve ser uma string' })
      }
      data.description = description
    }
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'nada para atualizar' })
    }

    const exists = await prisma.card.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'card nao encontrado' })

    const card = await prisma.card.update({ where: { id }, data })

    broadcast('card.updated', card)
    return card
  })

  // O endpoint do drag-and-drop. A position fracionaria vem calculada do cliente,
  // que e quem conhece os vizinhos do destino -- ver CLAUDE.md.
  app.patch('/api/cards/:id/move', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { listId, position } = (req.body ?? {}) as { listId?: unknown; position?: unknown }

    if (typeof listId !== 'string' || !listId) {
      return reply.code(400).send({ error: 'listId e obrigatorio' })
    }
    if (typeof position !== 'number' || !Number.isFinite(position)) {
      return reply.code(400).send({ error: 'position deve ser um numero finito' })
    }

    const exists = await prisma.card.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'card nao encontrado' })

    const list = await prisma.list.findUnique({ where: { id: listId } })
    if (!list) return reply.code(404).send({ error: 'lista de destino nao encontrada' })

    const card = await prisma.card.update({
      where: { id },
      data: { listId, position },
    })

    broadcast('card.moved', { id: card.id, listId: card.listId, position: card.position })
    return card
  })

  app.delete('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const exists = await prisma.card.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'card nao encontrado' })

    await prisma.card.delete({ where: { id } })

    broadcast('card.deleted', { id })
    return reply.code(204).send()
  })
}
