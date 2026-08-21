import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function activityRoutes(app: FastifyInstance) {
  /**
   * O log, mais recente primeiro -- e a ordem em que o Visualizador de Eventos
   * mostra. O desempate por id existe porque o SQLite guarda o timestamp com
   * precisao de milissegundo: duas gravacoes na mesma requisicao empatam em
   * `createdAt` e sem o segundo criterio a paginacao ficaria instavel.
   */
  app.get('/api/activity', async (req, reply) => {
    const { limit: raw } = req.query as { limit?: unknown }

    let limit = DEFAULT_LIMIT
    if (raw !== undefined) {
      // Query string chega sempre como string; `Number('')` e 0 e `Number('x')`
      // e NaN, entao os dois caem na validacao abaixo em vez de virar o default.
      const parsed = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        return reply
          .code(400)
          .send({ error: `limit deve ser um inteiro entre 1 e ${MAX_LIMIT}` })
      }
      limit = parsed
    }

    const items = await prisma.activity.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    })

    // `total` vem junto para a janela poder dizer "mostrando 50 de 312" sem uma
    // segunda chamada -- o log cresce sozinho e o usuario nao tem como saber
    // que a lista esta truncada.
    return { items, limit, total: await prisma.activity.count() }
  })

  /**
   * Limpar o log. Nao ha lixeira para o log: ele e o registro de que a lixeira
   * existiu, guardar um registro do registro nao acaba nunca.
   *
   * Sem broadcast: o cliente que apagou ja sabe, e um evento `activity.cleared`
   * nao esta em docs/API.md -- inventa-lo aqui divergiria do contrato. A janela
   * recarrega com GET /api/activity quando reabre.
   */
  app.delete('/api/activity', async () => {
    const { count } = await prisma.activity.deleteMany({})
    return { deleted: count }
  })
}
