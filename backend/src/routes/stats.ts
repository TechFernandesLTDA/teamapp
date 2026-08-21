import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { ALIVE } from '../trash.js'

const TRASHED = { deletedAt: { not: null } } as const

/** So os campos que a janela de propriedades mostra -- devolver o card inteiro
 *  faria `description` (texto livre, potencialmente longo) viajar duas vezes
 *  dentro de um endpoint que e so contagem. */
const CARD_SUMMARY = { id: true, title: true, listId: true, createdAt: true } as const

export async function statsRoutes(app: FastifyInstance) {
  /**
   * Propriedades do board: as contagens que a caixa de dialogo do Windows 95
   * mostraria. Leitura pura, sem broadcast.
   *
   * "Vivo" aqui e o que o board mostra, que e mais estrito que `deletedAt: null`
   * no card: um card sem `deletedAt` dentro de uma lista NA LIXEIRA sumiu da
   * tela junto com ela (ver o comentario do soft delete em routes/lists.ts).
   * Contar esse card em `cards` faria o total nao bater com a soma de
   * `cardsPerList`, que so percorre listas vivas -- dois numeros na mesma tela
   * discordando um do outro. Por isso o filtro de card e `{ ...ALIVE, list: ALIVE }`.
   */
  app.get('/api/stats', async () => {
    const liveCards = { ...ALIVE, list: ALIVE }

    const [lists, cards, trashedCards, trashedLists, listRows, oldestCard, newestCard] =
      await Promise.all([
        prisma.list.count({ where: ALIVE }),
        prisma.card.count({ where: liveCards }),
        prisma.card.count({ where: TRASHED }),
        prisma.list.count({ where: TRASHED }),
        prisma.list.findMany({
          where: ALIVE,
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            // `_count` com filtro resolve no proprio SQL: sem ele seria um SELECT
            // por lista, e a contagem viria errada de qualquer jeito, porque
            // `_count` sem `where` inclui os cards da lixeira.
            _count: { select: { cards: { where: ALIVE } } },
          },
        }),
        prisma.card.findFirst({
          where: liveCards,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: CARD_SUMMARY,
        }),
        prisma.card.findFirst({
          where: liveCards,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: CARD_SUMMARY,
        }),
      ])

    return {
      lists,
      cards,
      trashedCards,
      trashedLists,
      cardsPerList: listRows.map((list) => ({
        listId: list.id,
        title: list.title,
        count: list._count.cards,
      })),
      // null, nao um objeto vazio: board sem card nenhum e um estado normal
      // (logo depois de "Esvaziar Lixeira", por exemplo).
      oldestCard,
      newestCard,
      // Board sem lista da divisao por zero -> Infinity, que o JSON.stringify
      // transforma em `null` sem avisar ninguem. Duas casas porque a media de
      // cards por lista nao tem significado alem disso.
      avgCardsPerList: lists === 0 ? 0 : Math.round((cards / lists) * 100) / 100,
    }
  })
}
