import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { broadcast } from '../bus.js'
import { record } from '../activity.js'
import { ALIVE, broadcastTrash, trashCounts } from '../trash.js'

const CARD_ORDER = [{ position: 'asc' as const }, { id: 'asc' as const }]

export async function trashRoutes(app: FastifyInstance) {
  /**
   * Conteudo da Lixeira, mais recente primeiro (e o que a janela mostra).
   *
   * Cada card carrega `originalList` com `deleted`: se a lista de origem tambem
   * esta na lixeira, restaurar o card vai dar 409. O frontend consegue esmaecer
   * o botao Restaurar antes de o usuario clicar, em vez de mostrar um erro.
   */
  app.get('/api/trash', async () => {
    const [cards, lists] = await Promise.all([
      prisma.card.findMany({
        where: { deletedAt: { not: null } },
        orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
        include: { list: { select: { id: true, title: true, deletedAt: true } } },
      }),
      prisma.list.findMany({
        where: { deletedAt: { not: null } },
        orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
        include: { cards: { where: ALIVE, orderBy: CARD_ORDER } },
      }),
    ])

    return {
      cards: cards.map(({ list, ...card }) => ({
        ...card,
        originalList: { id: list.id, title: list.title, deleted: list.deletedAt !== null },
      })),
      // `cardCount` e quantos cards voltam junto se a lista for restaurada --
      // os que ja estavam na lixeira sozinhos nao contam, eles ficam la.
      lists: lists.map(({ cards: listCards, ...list }) => ({
        ...list,
        cardCount: listCards.length,
      })),
      counts: await trashCounts(),
    }
  })

  /**
   * Restaurar volta o item para a posicao original -- e a semantica do Windows,
   * e a position fracionaria aguenta: colisao de position empata por id, e a
   * ordenacao continua determinista.
   */
  app.post('/api/trash/cards/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string }

    const card = await prisma.card.findFirst({
      where: { id, deletedAt: { not: null } },
      include: { list: { select: { id: true, title: true, deletedAt: true } } },
    })
    if (!card) return reply.code(404).send({ error: 'card nao esta na lixeira' })

    if (card.list.deletedAt !== null) {
      return reply.code(409).send({
        error: `a lista "${card.list.title}" tambem esta na lixeira -- restaure a lista primeiro`,
      })
    }

    const { list: _list, ...rest } = card
    const restored = { ...rest, deletedAt: null }
    await prisma.card.update({ where: { id }, data: { deletedAt: null } })

    // `card.created`, nao um `card.restored` novo: o cliente ja faz upsert por id
    // com esse evento, entao restaurar aparece no board sem mudanca no frontend.
    broadcast('card.created', restored)
    await record('card.restored', `Card "${card.title}" restaurado da lixeira`)
    await broadcastTrash()
    return restored
  })

  app.post('/api/trash/lists/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string }

    const exists = await prisma.list.findFirst({ where: { id, deletedAt: { not: null } } })
    if (!exists) return reply.code(404).send({ error: 'lista nao esta na lixeira' })

    const list = await prisma.list.update({
      where: { id },
      data: { deletedAt: null },
      // Os cards vivos voltam junto: mandar a lista sem eles faria o cliente
      // fazer upsert de uma lista vazia por cima da que tem conteudo.
      include: { cards: { where: ALIVE, orderBy: CARD_ORDER } },
    })

    broadcast('list.created', list)
    await record('list.restored', `Lista "${list.title}" restaurada da lixeira`)
    await broadcastTrash()
    return list
  })

  app.delete('/api/trash/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const exists = await prisma.card.findFirst({ where: { id, deletedAt: { not: null } } })
    if (!exists) return reply.code(404).send({ error: 'card nao esta na lixeira' })

    await prisma.card.delete({ where: { id } })
    // `exists` foi capturado antes do delete: depois dele nao ha linha para ler.
    await record('card.purged', `Card "${exists.title}" apagado definitivamente`)
    // Sem `card.deleted`: para o board o card ja tinha sumido no soft delete.
    await broadcastTrash()
    return reply.code(204).send()
  })

  app.delete('/api/trash/lists/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const exists = await prisma.list.findFirst({ where: { id, deletedAt: { not: null } } })
    if (!exists) return reply.code(404).send({ error: 'lista nao esta na lixeira' })

    // Cascade do schema leva os cards junto, inclusive os que estavam na lixeira
    // sozinhos -- a lista de origem deles deixou de existir.
    await prisma.list.delete({ where: { id } })
    await record('list.purged', `Lista "${exists.title}" apagada definitivamente`)
    await broadcastTrash()
    return reply.code(204).send()
  })

  /** Esvaziar Lixeira. Irreversivel, como manda o figurino. */
  app.delete('/api/trash', async (_req, reply) => {
    const lists = await prisma.list.count({ where: { deletedAt: { not: null } } })

    // Conta os cards que VAO SUMIR, nao os que estao na lixeira: um card vivo
    // dentro de uma lista na lixeira tambem morre no cascade abaixo. Contar so
    // `deletedAt != null` reportava menos linhas do que a operacao apagava.
    const cards = await prisma.card.count({
      where: {
        OR: [{ deletedAt: { not: null } }, { list: { deletedAt: { not: null } } }],
      },
    })

    // Listas primeiro: o cascade ja apaga os cards delas, inclusive os que
    // estavam na lixeira por conta propria.
    await prisma.list.deleteMany({ where: { deletedAt: { not: null } } })
    await prisma.card.deleteMany({ where: { deletedAt: { not: null } } })

    await record(
      'trash.emptied',
      `Lixeira esvaziada: ${cards} card(s) e ${lists} lista(s) apagados`,
    )
    await broadcastTrash()
    return reply.send({ deleted: { cards, lists } })
  })
}
