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

  ws.close()
  console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FALHOU: ${failures} assercao(oes)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('smoke explodiu:', e.message)
  process.exit(1)
})
