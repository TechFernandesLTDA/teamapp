/**
 * Smoke test do contrato: REST + broadcast de WebSocket.
 * Uso: node scripts/smoke.mjs [baseUrl]   (default http://localhost:3001)
 * Sai com codigo 1 se qualquer assercao falhar.
 */
import WebSocket from 'ws'

const BASE = process.argv[2] ?? 'http://localhost:3001'
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws'

let failures = 0
const events = []

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ' -- ' + detail : ''}`)
  }
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const waitFor = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log(`smoke contra ${BASE}`)

  const health = await api('GET', '/api/health')
  check('GET /api/health -> 200 ok', health.status === 200 && health.body?.status === 'ok')

  // Um segundo cliente WS observa os eventos gerados pelas mutacoes deste script.
  const ws = new WebSocket(WS_URL)
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
    setTimeout(() => reject(new Error('timeout no handshake do websocket')), 5000)
  })
  ws.on('message', (raw) => events.push(JSON.parse(raw.toString())))
  check('websocket conecta em /ws', ws.readyState === 1)

  const board = await api('GET', '/api/board')
  check('GET /api/board -> 200', board.status === 200)
  check('board tem lists', Array.isArray(board.body?.lists) && board.body.lists.length > 0)
  const listsSorted = board.body.lists.every(
    (l, i, a) => i === 0 || a[i - 1].position <= l.position,
  )
  check('lists vem ordenadas por position', listsSorted)

  const created = await api('POST', '/api/lists', { title: 'Smoke List' })
  check('POST /api/lists -> 201', created.status === 201, `status ${created.status}`)
  const listId = created.body?.id

  const badList = await api('POST', '/api/lists', { title: '' })
  check('POST /api/lists com title vazio -> 400', badList.status === 400)

  const card = await api('POST', '/api/cards', { listId, title: 'Smoke Card' })
  check('POST /api/cards -> 201', card.status === 201, `status ${card.status}`)
  check('card nasce com description ""', card.body?.description === '')
  const cardId = card.body?.id

  const badCard = await api('POST', '/api/cards', { listId: 'nao-existe', title: 'x' })
  check('POST /api/cards com listId invalido -> 404', badCard.status === 404)

  const patched = await api('PATCH', `/api/cards/${cardId}`, { title: 'Smoke Card v2' })
  check('PATCH /api/cards/:id -> 200', patched.status === 200 && patched.body?.title === 'Smoke Card v2')

  // Move para a primeira lista do board com position fracionaria.
  const targetList = board.body.lists[0]
  const first = targetList.cards[0]
  const newPos = first ? first.position - 1 : 0
  const moved = await api('PATCH', `/api/cards/${cardId}/move`, {
    listId: targetList.id,
    position: newPos,
  })
  check('PATCH /api/cards/:id/move -> 200', moved.status === 200, `status ${moved.status}`)
  check('move respeita listId de destino', moved.body?.listId === targetList.id)
  check('move persiste position fracionaria', moved.body?.position === newPos)

  const halfPos = first ? (first.position + (targetList.cards[1]?.position ?? first.position + 1)) / 2 : 0.5
  const moved2 = await api('PATCH', `/api/cards/${cardId}/move`, {
    listId: targetList.id,
    position: halfPos,
  })
  check('move aceita position nao-inteira', moved2.status === 200 && moved2.body?.position === halfPos)

  const badMove = await api('PATCH', `/api/cards/${cardId}/move`, { listId: targetList.id, position: 'x' })
  check('move com position nao numerica -> 400', badMove.status === 400)

  await waitFor(400)

  // O broadcast tem que chegar em quem NAO originou a mutacao.
  const types = events.map((e) => e.type)
  check('WS recebeu list.created', types.includes('list.created'), `recebidos: ${types.join(', ')}`)
  check('WS recebeu card.created', types.includes('card.created'))
  check('WS recebeu card.updated', types.includes('card.updated'))
  check('WS recebeu card.moved', types.includes('card.moved'))

  const movedEvent = events.find((e) => e.type === 'card.moved')
  check(
    'payload de card.moved e { id, listId, position }',
    movedEvent && Object.keys(movedEvent.payload).sort().join(',') === 'id,listId,position',
    movedEvent ? JSON.stringify(movedEvent.payload) : 'evento ausente',
  )

  // --- Preflight de CORS ---
  // Estas assercoes existem porque o smoke original passava 27/27 com o
  // drag-and-drop 100% quebrado no browser: curl nao aplica CORS, e o default
  // do @fastify/cors ('GET,HEAD,POST') reprovava PATCH e DELETE no preflight.
  const ORIGIN = 'http://localhost:8090'

  async function preflight(method, path) {
    const res = await fetch(BASE + path, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    return {
      origin: res.headers.get('access-control-allow-origin'),
      methods: (res.headers.get('access-control-allow-methods') ?? '').toUpperCase(),
    }
  }

  for (const [method, path] of [
    ['PATCH', `/api/cards/${cardId}/move`],
    ['PATCH', `/api/cards/${cardId}`],
    ['DELETE', `/api/cards/${cardId}`],
    ['DELETE', `/api/lists/${listId}`],
    ['POST', '/api/cards'],
    ['DELETE', '/api/trash'],
    ['POST', `/api/trash/cards/${cardId}/restore`],
  ]) {
    const { origin, methods } = await preflight(method, path)
    check(
      `preflight ${method} ${path.replace(/\/[a-z0-9]{20,}/g, '/:id')} permite a origem`,
      origin === ORIGIN,
      `allow-origin: ${origin}`,
    )
    check(`preflight libera ${method}`, methods.includes(method), `allow-methods: ${methods}`)
  }

  const evil = await fetch(BASE + '/api/board', { headers: { Origin: 'http://evil.example' } })
  check(
    'origem nao listada nao recebe allow-origin',
    !evil.headers.get('access-control-allow-origin'),
  )

  // --- Envelope de erro ---
  // docs/API.md promete { error } em TODA falha, inclusive nas pre-rota.
  const notFound = await api('GET', '/api/rota-que-nao-existe')
  check('404 de rota inexistente usa envelope { error }', typeof notFound.body?.error === 'string')

  const malformed = await fetch(BASE + '/api/lists', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{isso nao e json',
  })
  const malformedBody = await malformed.json()
  check(
    'JSON malformado usa envelope { error }',
    typeof malformedBody?.error === 'string' && malformedBody.statusCode === undefined,
    JSON.stringify(malformedBody),
  )

  const del = await api('DELETE', `/api/cards/${cardId}`)
  check('DELETE /api/cards/:id -> 204', del.status === 204)

  const delList = await api('DELETE', `/api/lists/${listId}`)
  check('DELETE /api/lists/:id -> 204', delList.status === 204)

  const missing = await api('DELETE', `/api/cards/${cardId}`)
  check('DELETE de card inexistente -> 404', missing.status === 404)

  await waitFor(300)
  check('WS recebeu card.deleted', events.some((e) => e.type === 'card.deleted'))
  check('WS recebeu list.deleted', events.some((e) => e.type === 'list.deleted'))

  // A lista deletada nao pode reaparecer no board.
  const after = await api('GET', '/api/board')
  check('lista deletada sumiu do board', !after.body.lists.some((l) => l.id === listId))

  // --- Lixeira ---
  // Depois dos DELETEs acima, `cardId` e `listId` estao na lixeira, nao apagados.
  // Estas assercoes existem porque soft delete muda o significado de todo
  // findUnique por id: sem filtro de deletedAt da para renomear, mover e criar
  // dentro de coisas que o board nao mostra mais.
  const trash = await api('GET', '/api/trash')
  check('GET /api/trash -> 200', trash.status === 200)
  const trashedCard = trash.body?.cards?.find((c) => c.id === cardId)
  const trashedList = trash.body?.lists?.find((l) => l.id === listId)
  check('card deletado aparece na lixeira', Boolean(trashedCard))
  check('lista deletada aparece na lixeira', Boolean(trashedList))
  check('card na lixeira traz originalList', Boolean(trashedCard?.originalList?.title))
  check(
    'originalList.deleted e false quando a lista de origem esta viva',
    trashedCard?.originalList?.deleted === false,
  )
  check('lista na lixeira traz cardCount', typeof trashedList?.cardCount === 'number')
  check('WS recebeu trash.updated', events.some((e) => e.type === 'trash.updated'))
  const trashEvent = events.filter((e) => e.type === 'trash.updated').pop()
  check(
    'payload de trash.updated e so a contagem { cards, lists }',
    trashEvent && Object.keys(trashEvent.payload).sort().join(',') === 'cards,lists',
    trashEvent ? JSON.stringify(trashEvent.payload) : 'evento ausente',
  )
  const boardWithTrash = await api('GET', '/api/board')
  check('GET /api/board traz a contagem da lixeira', typeof boardWithTrash.body?.trash?.cards === 'number')
  check(
    'card na lixeira nao aparece no board',
    !boardWithTrash.body.lists.flatMap((l) => l.cards).some((c) => c.id === cardId),
  )

  // Nada que opera sobre recurso vivo pode enxergar item na lixeira.
  const patchTrashed = await api('PATCH', `/api/cards/${cardId}`, { title: 'zumbi' })
  check('PATCH em card na lixeira -> 404', patchTrashed.status === 404, `status ${patchTrashed.status}`)
  const moveTrashed = await api('PATCH', `/api/cards/${cardId}/move`, { listId: targetList.id, position: 0 })
  check('move de card na lixeira -> 404', moveTrashed.status === 404, `status ${moveTrashed.status}`)
  const renameTrashedList = await api('PATCH', `/api/lists/${listId}`, { title: 'zumbi' })
  check('PATCH em lista na lixeira -> 404', renameTrashedList.status === 404, `status ${renameTrashedList.status}`)
  const cardIntoTrashedList = await api('POST', '/api/cards', { listId, title: 'zumbi' })
  check('POST /api/cards em lista na lixeira -> 404', cardIntoTrashedList.status === 404, `status ${cardIntoTrashedList.status}`)
  const someLiveCardId = boardWithTrash.body.lists.flatMap((l) => l.cards)[0]?.id ?? 'x'
  const moveIntoTrashedList = await api('PATCH', `/api/cards/${someLiveCardId}/move`, { listId, position: 0 })
  check('move para lista na lixeira -> 404', moveIntoTrashedList.status === 404, `status ${moveIntoTrashedList.status}`)

  // Restaurar devolve o item ao lugar de origem e ele reaparece no board.
  const restored = await api('POST', `/api/trash/cards/${cardId}/restore`)
  check('POST /api/trash/cards/:id/restore -> 200', restored.status === 200, `status ${restored.status}`)
  check('card restaurado sai da lixeira', restored.body?.deletedAt === null)
  await waitFor(250)
  const boardAfterRestore = await api('GET', '/api/board')
  check(
    'card restaurado volta ao board',
    boardAfterRestore.body.lists.flatMap((l) => l.cards).some((c) => c.id === cardId),
  )
  check(
    'restaurar reusa card.created (o cliente ja faz upsert por id)',
    events.filter((e) => e.type === 'card.created').some((e) => e.payload?.id === cardId),
  )
  const doubleRestore = await api('POST', `/api/trash/cards/${cardId}/restore`)
  check('restaurar card que ja voltou -> 404', doubleRestore.status === 404)

  const restoredList = await api('POST', `/api/trash/lists/${listId}/restore`)
  check('POST /api/trash/lists/:id/restore -> 200', restoredList.status === 200, `status ${restoredList.status}`)
  check(
    'lista restaurada vem com cards[] (senao o cliente sobrescreve com vazio)',
    Array.isArray(restoredList.body?.cards),
  )
  const boardAfterListRestore = await api('GET', '/api/board')
  check('lista restaurada volta ao board', boardAfterListRestore.body.lists.some((l) => l.id === listId))

  // Card na lixeira cuja lista tambem foi para a lixeira: 409 explicito, nao 500
  // nem restauracao dentro de uma lista que o board nao mostra.
  const orphan = await api('POST', '/api/cards', { listId, title: 'Orfao' })
  const orphanId = orphan.body?.id
  await api('DELETE', `/api/cards/${orphanId}`)
  await api('DELETE', `/api/lists/${listId}`)
  const orphanRestore = await api('POST', `/api/trash/cards/${orphanId}/restore`)
  check('restaurar card cuja lista esta na lixeira -> 409', orphanRestore.status === 409, `status ${orphanRestore.status}`)
  const trashWithOrphan = await api('GET', '/api/trash')
  check(
    'originalList.deleted avisa que o restore vai falhar',
    trashWithOrphan.body.cards.find((c) => c.id === orphanId)?.originalList?.deleted === true,
  )
  const listBack = await api('POST', `/api/trash/lists/${listId}/restore`)
  check('restaurar a lista destrava o card', listBack.status === 200)
  check(
    'card jogado fora sozinho NAO ressuscita junto com a lista',
    !listBack.body.cards.some((c) => c.id === orphanId),
  )
  const trashAfterListBack = await api('GET', '/api/trash')
  check('...e continua na lixeira', trashAfterListBack.body.cards.some((c) => c.id === orphanId))
  const orphanRestore2 = await api('POST', `/api/trash/cards/${orphanId}/restore`)
  check('com a lista de volta, o card restaura', orphanRestore2.status === 200, `status ${orphanRestore2.status}`)

  // Apagar de vez, item a item.
  await api('DELETE', `/api/cards/${orphanId}`)
  const purge = await api('DELETE', `/api/trash/cards/${orphanId}`)
  check('DELETE /api/trash/cards/:id -> 204', purge.status === 204)
  const trashAfterPurge = await api('GET', '/api/trash')
  check('apagado de vez some da lixeira', !trashAfterPurge.body.cards.some((c) => c.id === orphanId))
  const purgeLive = await api('DELETE', `/api/trash/cards/${cardId}`)
  check('apagar de vez um card vivo -> 404', purgeLive.status === 404)

  // Esvaziar Lixeira. Destrutivo de verdade: guarda o card de demonstracao do
  // seed antes e recria pela API depois, senao rodar o smoke apaga a piada.
  const trashBeforeEmpty = await api('GET', '/api/trash')
  const demo = trashBeforeEmpty.body.cards.find((c) => c.title === 'Trabalho de Estagio.doc')
  await api('DELETE', `/api/cards/${cardId}`)
  await api('DELETE', `/api/lists/${listId}`)
  // Um card VIVO dentro de uma lista na lixeira morre no cascade do esvaziar.
  // A contagem retornada tem que inclui-lo: contar so `deletedAt != null`
  // reportava menos linhas do que a operacao realmente apagava.
  const doomedList = await api('POST', '/api/lists', { title: 'Lista com card vivo' })
  const liveInside = await api('POST', '/api/cards', {
    listId: doomedList.body.id,
    title: 'Vivo, mas condenado',
  })
  await api('DELETE', `/api/lists/${doomedList.body.id}`)
  const countsBefore = (await api('GET', '/api/trash')).body.counts

  const emptied = await api('DELETE', '/api/trash')
  check(
    'DELETE /api/trash -> 200 com { deleted }',
    emptied.status === 200 && typeof emptied.body?.deleted?.cards === 'number',
    `status ${emptied.status}`,
  )
  check(
    'esvaziar conta o card vivo que o cascade leva junto',
    emptied.body?.deleted?.cards > countsBefore.cards,
    `reportou ${emptied.body?.deleted?.cards}, lixeira tinha ${countsBefore.cards} + 1 vivo dentro da lista`,
  )
  const gone = await api('PATCH', `/api/cards/${liveInside.body.id}`, { title: 'x' })
  check('...e ele realmente sumiu', gone.status === 404, `status ${gone.status}`)

  const afterEmpty = await api('GET', '/api/trash')
  check('lixeira fica vazia', afterEmpty.body.cards.length === 0 && afterEmpty.body.lists.length === 0)
  const boardAfterEmpty = await api('GET', '/api/board')
  check('esvaziar a lixeira nao toca no board', boardAfterEmpty.body.lists.length > 0)
  check('lista apagada de vez nao volta', !boardAfterEmpty.body.lists.some((l) => l.id === listId))

  if (demo && !demo.originalList.deleted) {
    const remade = await api('POST', '/api/cards', {
      listId: demo.originalList.id,
      title: demo.title,
      description: demo.description,
    })
    if (remade.status === 201) await api('DELETE', `/api/cards/${remade.body.id}`)
  }

  ws.close()
  console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FALHOU: ${failures} assercao(oes)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('smoke explodiu:', e.message)
  process.exit(1)
})
