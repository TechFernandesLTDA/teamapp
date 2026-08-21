// Testes de mesa da Lixeira -- funcoes puras, sem banco, sem servidor rodando.
//
// Runner: node:test nativo (`node --test test/`). Zero dependencia extra.
//
// ATENCAO -- ESPELHO DE CONTRATO
// As regras modeladas aqui vivem de verdade em `backend/src/routes/trash.ts`,
// `backend/src/routes/lists.ts` e `backend/src/routes/cards.ts` (e no
// `deletedAt` de `backend/prisma/schema.prisma`), sobre o Prisma. Este arquivo
// REPLICA as transicoes como funcoes puras de estado -> estado para poder testar
// as duas regras que mais surpreendem sem subir SQLite. A autoridade e a secao
// "A Lixeira" de docs/API.md; se um teste daqui falhar contra o backend real, o
// backend e que divergiu.
//
// As duas regras sob teste:
//   (a) mandar uma LISTA para a lixeira NAO marca os cards dela. Restaurar a
//       lista traz de volta so os cards que estavam vivos -- um card jogado fora
//       sozinho continua na lixeira.
//   (b) restaurar um CARD cuja lista de origem esta na lixeira e bloqueado (409).

import test from 'node:test'
import assert from 'node:assert/strict'

// --- Modelo puro --------------------------------------------------------------
// Nada muta: toda transicao devolve `{ state, status, body? }`, como a rota HTTP.

const AT = '2026-08-21T04:12:00.000Z' // timestamp fixo: deletedAt so precisa ser truthy

const clone = (state) => ({
  lists: state.lists.map((l) => ({ ...l })),
  cards: state.cards.map((c) => ({ ...c })),
})

const alive = (row) => row.deletedAt === null
const trashed = (row) => row.deletedAt !== null

function makeState({ lists = [], cards = [] } = {}) {
  return {
    lists: lists.map((l) => ({ deletedAt: null, position: 0, ...l })),
    cards: cards.map((c) => ({ deletedAt: null, position: 0, description: '', ...c })),
  }
}

const findList = (state, id) => state.lists.find((l) => l.id === id)
const findCard = (state, id) => state.cards.find((c) => c.id === id)

/** GET /api/board -- nem listas nem cards da lixeira aparecem. */
function board(state) {
  return state.lists
    .filter(alive)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((list) => ({
      id: list.id,
      title: list.title,
      // Um card so aparece se ELE esta vivo E a lista dele esta viva.
      cards: state.cards
        .filter((c) => c.listId === list.id && alive(c))
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((c) => c.id),
    }))
}

/** DELETE /api/lists/:id -- soft delete. NAO toca nos cards. */
function trashList(state, id) {
  const next = clone(state)
  const list = findList(next, id)
  if (!list || trashed(list)) return { state, status: 404 }
  list.deletedAt = AT
  return { state: next, status: 204 }
}

/** DELETE /api/cards/:id -- soft delete do card sozinho. */
function trashCard(state, id) {
  const next = clone(state)
  const card = findCard(next, id)
  if (!card) return { state, status: 404 }
  const list = findList(next, card.listId)
  // Rota de recurso vivo: card em lista na lixeira responde 404, como se nao existisse.
  if (trashed(card) || !list || trashed(list)) return { state, status: 404 }
  card.deletedAt = AT
  return { state: next, status: 204 }
}

/** POST /api/trash/lists/:id/restore -- 200 List com cards[] SO dos vivos. */
function restoreList(state, id) {
  const next = clone(state)
  const list = findList(next, id)
  if (!list || alive(list)) return { state, status: 404 }
  list.deletedAt = null
  const cards = next.cards
    .filter((c) => c.listId === id && alive(c))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  return { state: next, status: 200, body: { ...list, cards } }
}

/** POST /api/trash/cards/:id/restore -- 409 se a lista de origem esta na lixeira. */
function restoreCard(state, id) {
  const next = clone(state)
  const card = findCard(next, id)
  if (!card || alive(card)) return { state, status: 404 }
  const list = findList(next, card.listId)
  if (!list || trashed(list)) return { state, status: 409 }
  card.deletedAt = null
  return { state: next, status: 200, body: { ...card } }
}

/** GET /api/trash -- inclui originalList.deleted e cardCount. */
function trash(state) {
  const cards = state.cards.filter(trashed).map((c) => {
    const list = findList(state, c.listId)
    return {
      id: c.id,
      originalList: { id: list.id, title: list.title, deleted: trashed(list) },
    }
  })
  const lists = state.lists.filter(trashed).map((l) => ({
    id: l.id,
    // Quantos cards voltam junto se a lista for restaurada -- os que ja estavam
    // na lixeira sozinhos NAO contam.
    cardCount: state.cards.filter((c) => c.listId === l.id && alive(c)).length,
  }))
  return { cards, lists, counts: { cards: cards.length, lists: lists.length } }
}

/** DELETE /api/trash/lists/:id -- apaga de verdade, cascateia nos cards. */
function purgeList(state, id) {
  const next = clone(state)
  const list = findList(next, id)
  if (!list || alive(list)) return { state, status: 404 }
  next.lists = next.lists.filter((l) => l.id !== id)
  // Cascade leva TODOS os cards da lista, inclusive os que estavam na lixeira sozinhos.
  next.cards = next.cards.filter((c) => c.listId !== id)
  return { state: next, status: 204 }
}

/** Cenario base: lista "A Fazer" com tres cards vivos + uma lista vizinha. */
const scenario = () =>
  makeState({
    lists: [
      { id: 'L1', title: 'A Fazer', position: 1 },
      { id: 'L2', title: 'Feito', position: 2 },
    ],
    cards: [
      { id: 'C1', listId: 'L1', title: 'um', position: 1 },
      { id: 'C2', listId: 'L1', title: 'dois', position: 2 },
      { id: 'C3', listId: 'L1', title: 'tres', position: 3 },
      { id: 'C9', listId: 'L2', title: 'outro', position: 1 },
    ],
  })

// --- Regra (a): lista na lixeira nao marca os cards ---------------------------

test('(a) mandar a lista para a lixeira NAO marca os cards dela', () => {
  const s0 = scenario()
  const { state: s1, status } = trashList(s0, 'L1')

  assert.equal(status, 204)
  // Os cards continuam com deletedAt null -- eles somem do board porque a LISTA sumiu.
  for (const id of ['C1', 'C2', 'C3']) {
    assert.equal(findCard(s1, id).deletedAt, null, `${id} nao pode ser marcado em cascata`)
  }
  assert.deepEqual(board(s1), [{ id: 'L2', title: 'Feito', cards: ['C9'] }])
  // E a lixeira mostra 1 lista e ZERO cards: cascata marcada apareceria aqui.
  assert.deepEqual(trash(s1).counts, { cards: 0, lists: 1 })
  assert.equal(trash(s1).lists[0].cardCount, 3, 'cardCount = quantos voltam junto')
})

test('(a) restaurar a lista traz so os cards que estavam vivos', () => {
  let s = scenario()
  ;({ state: s } = trashCard(s, 'C2')) // C2 vai pra lixeira SOZINHO, antes da lista
  ;({ state: s } = trashList(s, 'L1'))

  assert.deepEqual(trash(s).counts, { cards: 1, lists: 1 })

  const { state: restored, status, body } = restoreList(s, 'L1')
  assert.equal(status, 200)
  assert.deepEqual(
    body.cards.map((c) => c.id),
    ['C1', 'C3'],
    'a resposta traz cards[] populado, so os vivos',
  )
  // C2 continua na lixeira: quem foi jogado fora sozinho nao volta de carona.
  assert.equal(findCard(restored, 'C2').deletedAt, AT)
  assert.deepEqual(board(restored)[0], { id: 'L1', title: 'A Fazer', cards: ['C1', 'C3'] })
  assert.deepEqual(trash(restored).counts, { cards: 1, lists: 0 })
})

test('(a) o ciclo lixeira->restore e idempotente para quem estava vivo', () => {
  const s0 = scenario()
  const s1 = restoreList(trashList(s0, 'L1').state, 'L1').state
  assert.deepEqual(board(s1), board(s0), 'ida e volta sem cards proprios volta ao estado original')
})

// --- Regra (b): restore de card com lista de origem na lixeira = 409 ----------

test('(b) restaurar card cuja lista de origem esta na lixeira retorna 409', () => {
  let s = scenario()
  ;({ state: s } = trashCard(s, 'C2'))
  ;({ state: s } = trashList(s, 'L1'))

  const attempt = restoreCard(s, 'C2')
  assert.equal(attempt.status, 409)
  // 409 nao pode alterar nada: o card segue na lixeira.
  assert.equal(findCard(attempt.state, 'C2').deletedAt, AT)
  assert.deepEqual(trash(attempt.state).counts, { cards: 1, lists: 1 })
})

test('(b) GET /api/trash sinaliza o 409 antes do clique via originalList.deleted', () => {
  let s = scenario()
  ;({ state: s } = trashCard(s, 'C2'))

  // Lista de origem viva: o botao "Restaurar" fica ativo e o restore passa.
  assert.equal(trash(s).cards[0].originalList.deleted, false)
  assert.equal(restoreCard(s, 'C2').status, 200)

  // Mesma lixeira, agora com a lista de origem tambem la dentro (nao reatribui
  // acima de proposito: C2 continua na lixeira em `s`).
  ;({ state: s } = trashList(s, 'L1'))
  assert.equal(trash(s).cards[0].originalList.deleted, true, 'lista morta -> botao esmaecido')
  assert.equal(restoreCard(s, 'C2').status, 409)
})

test('(b) restaurar a lista primeiro desbloqueia o restore do card', () => {
  let s = scenario()
  ;({ state: s } = trashCard(s, 'C2'))
  ;({ state: s } = trashList(s, 'L1'))

  assert.equal(restoreCard(s, 'C2').status, 409)
  ;({ state: s } = restoreList(s, 'L1'))

  const done = restoreCard(s, 'C2')
  assert.equal(done.status, 200)
  assert.deepEqual(board(done.state)[0].cards, ['C1', 'C2', 'C3'], 'volta na position original')
  assert.deepEqual(trash(done.state).counts, { cards: 0, lists: 0 })
})

// --- Bordas que caem das duas regras -----------------------------------------

test('rota de recurso vivo trata item na lixeira como 404', () => {
  let s = scenario()
  ;({ state: s } = trashList(s, 'L1'))

  assert.equal(trashList(s, 'L1').status, 404, 'lista ja na lixeira')
  assert.equal(trashCard(s, 'C1').status, 404, 'card vivo dentro de lista na lixeira')
  assert.equal(restoreList(s, 'L2').status, 404, 'lista viva nao esta na lixeira')
  assert.equal(restoreCard(s, 'C9').status, 404, 'card vivo nao esta na lixeira')
})

test('apagar a lista de vez cascateia inclusive nos cards que estavam na lixeira sozinhos', () => {
  let s = scenario()
  ;({ state: s } = trashCard(s, 'C2'))
  ;({ state: s } = trashList(s, 'L1'))

  const { state: purged, status } = purgeList(s, 'L1')
  assert.equal(status, 204)
  assert.equal(findCard(purged, 'C2'), undefined, 'C2 vai junto -- a lista de origem sumiu')
  assert.deepEqual(
    purged.cards.map((c) => c.id),
    ['C9'],
  )
  assert.deepEqual(trash(purged).counts, { cards: 0, lists: 0 })
})

test('as transicoes nao mutam o estado recebido', () => {
  const s0 = scenario()
  const snapshot = JSON.stringify(s0)
  trashList(s0, 'L1')
  trashCard(s0, 'C1')
  restoreList(trashList(s0, 'L1').state, 'L1')
  assert.equal(JSON.stringify(s0), snapshot)
})
