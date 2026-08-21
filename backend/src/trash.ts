import { prisma } from './db.js'
import { broadcast } from './bus.js'

/**
 * A Lixeira do Windows 95.
 *
 * `deletedAt` transforma DELETE em soft delete: a linha continua no banco, some
 * do `GET /api/board` e reaparece em `GET /api/trash`. So `DELETE /api/trash`
 * (Esvaziar Lixeira) e `DELETE /api/trash/{cards,lists}/:id` apagam de verdade.
 *
 * A consequencia que pega desprevenido: `findUnique({ where: { id } })` continua
 * achando linha na lixeira. Toda rota que opera sobre um recurso vivo precisa
 * filtrar `deletedAt: null` explicitamente, senao da para renomear, mover e
 * "apagar" (de novo) um card que o board nem mostra mais. Use os helpers abaixo
 * em vez de escrever o where na mao.
 */

export const ALIVE = { deletedAt: null } as const

export function findLiveCard(id: string) {
  return prisma.card.findFirst({ where: { id, ...ALIVE } })
}

export function findLiveList(id: string) {
  return prisma.list.findFirst({ where: { id, ...ALIVE } })
}

export async function trashCounts() {
  const [cards, lists] = await Promise.all([
    prisma.card.count({ where: { deletedAt: { not: null } } }),
    prisma.list.count({ where: { deletedAt: { not: null } } }),
  ])
  return { cards, lists }
}

/**
 * Avisa que a lixeira mudou -- e so a contagem, para o icone do desktop trocar
 * de cheia para vazia. O conteudo vem de `GET /api/trash` quando a janela abre;
 * mandar a lixeira inteira em cada delete violaria "payload nunca e o board todo".
 */
export async function broadcastTrash() {
  broadcast('trash.updated', await trashCounts())
}
