import { prisma } from './db.js'
import { broadcast } from './bus.js'

/**
 * O Visualizador de Eventos do Windows 95: um log append-only de tudo que muda
 * no board. Uma linha por mutacao, com o texto ja formatado -- o cliente so
 * imprime `summary`, nunca remonta a frase a partir de ids.
 *
 * ------------------------------------------------------------------------
 * ONDE LIGAR AS CHAMADAS `record(...)`
 * ------------------------------------------------------------------------
 * As rotas de cards/lists/trash NAO estao instrumentadas -- esta sessao nao
 * pode edita-las. A lista abaixo diz exatamente onde inserir cada chamada.
 * As linhas sao do estado do repo em que este arquivo foi escrito; cada uma
 * vai LOGO DEPOIS do `broadcast(...)` correspondente, para que o log so
 * registre o que ja foi persistido e anunciado.
 *
 * Em todas elas basta acrescentar o import no topo do arquivo:
 *     import { record } from '../activity.js'
 *
 * src/routes/cards.ts
 *   ~L43  apos broadcast('card.created', card)
 *         await record('card.created', `Card "${card.title}" criado em "${list.title}"`)
 *   ~L76  apos broadcast('card.updated', card)
 *         await record('card.updated', card.title !== exists.title
 *           ? `Card "${exists.title}" renomeado para "${card.title}"`
 *           : `Card "${card.title}" editado`)
 *   ~L104 apos broadcast('card.moved', ...)
 *         await record('card.moved', `Card "${card.title}" movido para "${list.title}"`)
 *   ~L119 apos broadcast('card.deleted', { id })
 *         await record('card.deleted', `Card "${exists.title}" foi para a lixeira`)
 *
 * src/routes/lists.ts
 *   ~L32  apos broadcast('list.created', list)
 *         await record('list.created', `Lista "${list.title}" criada`)
 *   ~L66  apos broadcast('list.updated', list)
 *         await record('list.updated', list.title !== exists.title
 *           ? `Lista "${exists.title}" renomeada para "${list.title}"`
 *           : `Lista "${list.title}" reordenada`)
 *   ~L81  apos broadcast('list.deleted', { id })
 *         await record('list.deleted', `Lista "${exists.title}" foi para a lixeira`)
 *
 * src/routes/trash.ts
 *   ~L71  apos broadcast('card.created', restored)
 *         await record('card.restored', `Card "${card.title}" restaurado da lixeira`)
 *   ~L90  apos broadcast('list.created', list)
 *         await record('list.restored', `Lista "${list.title}" restaurada da lixeira`)
 *   ~L100 apos prisma.card.delete({ where: { id } })
 *         await record('card.purged', `Card "${exists.title}" apagado definitivamente`)
 *   ~L113 apos prisma.list.delete({ where: { id } })
 *         await record('list.purged', `Lista "${exists.title}" apagada definitivamente`)
 *   ~L135 apos os dois deleteMany de DELETE /api/trash
 *         await record('trash.emptied',
 *           `Lixeira esvaziada: ${cards} card(s) e ${lists} lista(s) apagados`)
 *
 * Cuidado nos dois `purged` e no `trash.emptied`: o titulo tem que ser lido da
 * variavel `exists`/`card` capturada ANTES do delete -- depois dele a linha nao
 * existe mais para consultar.
 */

/** O que `record` aceita em `type`. String livre de proposito: o log registra
 *  acoes que nao sao eventos de WebSocket (`card.purged`, `trash.emptied`), e
 *  amarra-lo ao `EventType` do bus obrigaria a inventar evento para cada uma. */
export type ActivityType =
  | 'list.created'
  | 'list.updated'
  | 'list.deleted'
  | 'list.restored'
  | 'list.purged'
  | 'card.created'
  | 'card.updated'
  | 'card.moved'
  | 'card.deleted'
  | 'card.restored'
  | 'card.purged'
  | 'trash.emptied'
  | (string & {})

/**
 * Grava uma linha no log e anuncia `activity.recorded`.
 *
 * NUNCA lanca. Log e efeito colateral: se o insert falhar, a mutacao que o
 * chamou ja aconteceu e nao pode virar 500 por causa disso. O erro vai para o
 * stderr e a vida segue -- por isso o `await record(...)` nas rotas e seguro.
 *
 * Retorna a linha gravada, ou `null` se a gravacao falhou.
 */
export async function record(type: ActivityType, summary: string) {
  try {
    const activity = await prisma.activity.create({ data: { type, summary } })
    broadcast('activity.recorded', activity)
    return activity
  } catch (err) {
    // console, e nao o logger do Fastify: `record` e chamado de dentro das rotas
    // mas nao recebe a instancia do app, e passar `app` so para logar o caso raro
    // obrigaria a mudar a assinatura de toda chamada.
    console.error('[activity] falha ao gravar log (mutacao NAO foi afetada):', err)
    return null
  }
}
