/**
 * Teste de carga do WebSocket: prova sob concorrencia as invariantes que o
 * CLAUDE.md declara e que o smoke.mjs so verifica com um cliente e uma mutacao
 * de cada vez.
 *
 * Uso: node scripts/ws-stress.mjs [baseUrl]   (default http://localhost:3001)
 * Sai com codigo 1 se qualquer assercao falhar.
 *
 * O que ele prova:
 *
 *  1. BROADCAST NAO FILTRA AUTOR -- 10 clientes abertos ao mesmo tempo recebem
 *     exatamente a mesma sequencia de eventos, na mesma ordem. Se o servidor
 *     algum dia tentar "otimizar" pulando quem originou a mutacao, ou se um
 *     socket lento perder mensagens, os logs divergem e o teste quebra.
 *
 *  2. IDEMPOTENCIA POR id -- o reducer daqui e um espelho de
 *     frontend/src/useBoard.ts. Aplicar cada evento duas vezes seguidas tem que
 *     dar o mesmo estado que aplicar uma vez (e o caso real: quem faz a mutacao
 *     ve a resposta HTTP E o eco do broadcast). E aplicar o log inteiro duas
 *     vezes tem que convergir para o mesmo estado.
 *
 *  3. CONVERGENCIA -- o estado derivado so dos eventos, partindo de um
 *     GET /api/board tirado ANTES da primeira mutacao, tem que bater com um
 *     GET /api/board fresco tirado DEPOIS da ultima. Esta e a assercao que vale
 *     o script: se ela falha, ou o servidor esqueceu de emitir um evento, ou
 *     emitiu um payload que nao descreve o que ele gravou. Nos dois casos o
 *     board do browser fica errado ate o proximo reload.
 *
 * O script assume que ninguem mais esta mutando o board enquanto ele roda (uma
 * aba aberta so olhando nao atrapalha -- o WebSocket e so servidor -> cliente).
 */
import WebSocket from 'ws'

const BASE = process.argv[2] ?? 'http://localhost:3001'
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws'
const CLIENTS = 10

let failures = 0

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ' -- ' + detail : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
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

/** Igualdade estrutural com chaves ordenadas -- serve tambem para o diff. */
function canon(value) {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const same = (a, b) => canon(a) === canon(b)

// ---------------------------------------------------------------------------
// Reducer: espelho de frontend/src/useBoard.ts. Se as duas semanticas
// divergirem, este teste passa e o browser quebra -- entao mantenha-os iguais.
// ---------------------------------------------------------------------------

const byPosition = (items) => [...items].sort((a, b) => a.position - b.position)

function reduce(board, event) {
  switch (event.type) {
    case 'list.created':
    case 'list.updated': {
      const incoming = event.payload
      const exists = board.lists.some((l) => l.id === incoming.id)
      const lists = exists
        ? board.lists.map((l) => {
            if (l.id !== incoming.id) return l
            const cards = 'cards' in incoming ? incoming.cards : l.cards
            return { ...l, ...incoming, cards: byPosition(cards) }
          })
        : [...board.lists, { ...incoming, cards: byPosition(incoming.cards ?? []) }]
      return { ...board, lists: byPosition(lists) }
    }

    case 'list.deleted':
      return { ...board, lists: board.lists.filter((l) => l.id !== event.payload.id) }

    case 'card.created':
    case 'card.updated': {
      const card = event.payload
      if (!board.lists.some((l) => l.id === card.listId)) return { ...board, stale: true }
      const lists = board.lists.map((list) => {
        const without = list.cards.filter((c) => c.id !== card.id)
        if (list.id !== card.listId) {
          return without.length === list.cards.length ? list : { ...list, cards: without }
        }
        return { ...list, cards: byPosition([...without, card]) }
      })
      return { ...board, lists }
    }

    case 'card.moved': {
      const { id, listId, position } = event.payload
      const existing = board.lists.flatMap((l) => l.cards).find((c) => c.id === id)
      if (!existing) return { ...board, stale: true }
      const moved = { ...existing, listId, position }
      const lists = board.lists.map((list) => {
        const without = list.cards.filter((c) => c.id !== id)
        if (list.id !== listId) {
          return without.length === list.cards.length ? list : { ...list, cards: without }
        }
        return { ...list, cards: byPosition([...without, moved]) }
      })
      return { ...board, lists }
    }

    case 'trash.updated':
      return { ...board, trash: event.payload }

    case 'card.deleted': {
      const { id } = event.payload
      return {
        ...board,
        lists: board.lists.map((l) => {
          const cards = l.cards.filter((c) => c.id !== id)
          return cards.length === l.cards.length ? l : { ...l, cards }
        }),
      }
    }

    default:
      return board
  }
}

const replay = (base, log) => log.reduce(reduce, base)

/** Aplica cada evento DUAS vezes seguidas -- o eco do broadcast em cima da resposta HTTP. */
const replayDoubled = (base, log) =>
  log.reduce((acc, e) => reduce(reduce(acc, e), e), base)

/**
 * Forma canonica de um board para comparacao.
 *
 * A ordenacao usa (position, id) porque e o que o servidor faz
 * (`orderBy: [{position}, {id}]`, ver docs/API.md): com dois cards empatados na
 * mesma position -- o que POSTs paralelos na mesma lista conseguem produzir --
 * comparar so por position acusaria uma divergencia que nao existe. Os dois
 * lados passam pela mesma normalizacao, entao uma divergencia de verdade
 * (card na lista errada, position errada, titulo velho) continua aparecendo.
 */
function snapshot(board) {
  const ord = (a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return {
    trash: board.trash ?? null,
    lists: [...board.lists].sort(ord).map((l) => ({
      id: l.id,
      title: l.title,
      position: l.position,
      cards: [...l.cards].sort(ord).map((c) => ({
        id: c.id,
        listId: c.listId,
        title: c.title,
        description: c.description,
        position: c.position,
      })),
    })),
  }
}

/** Primeira diferenca entre dois snapshots, em texto -- para a mensagem do FAIL. */
function firstDiff(a, b, path = '$') {
  if (canon(a) === canon(b)) return null
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: ${a.length} vs ${b.length} itens`
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`)
      if (d) return d
    }
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`)
      if (d) return d
    }
  }
  return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`
}

// ---------------------------------------------------------------------------

function openClient(index) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL)
    const client = { index, socket, events: [], raw: [] }
    const timer = setTimeout(() => reject(new Error(`timeout no handshake do cliente ${index}`)), 5000)
    socket.on('open', () => {
      clearTimeout(timer)
      resolve(client)
    })
    socket.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    socket.on('message', (data) => {
      const text = data.toString()
      client.raw.push(text)
      client.events.push(JSON.parse(text))
    })
  })
}

/** Espera o broadcast parar de chegar: `quietMs` sem nenhum evento novo. */
async function settle(clients, quietMs = 600, maxMs = 15000) {
  const total = () => clients.reduce((n, c) => n + c.events.length, 0)
  const started = Date.now()
  let last = total()
  let lastChange = Date.now()
  while (Date.now() - started < maxMs) {
    await waitFor(100)
    const now = total()
    if (now !== last) {
      last = now
      lastChange = Date.now()
    } else if (Date.now() - lastChange >= quietMs) {
      return
    }
  }
}

async function main() {
  console.log(`ws-stress contra ${BASE} com ${CLIENTS} clientes`)

  const health = await api('GET', '/api/health')
  if (health.status !== 200) {
    console.error(`servidor nao respondeu /api/health (status ${health.status})`)
    process.exit(1)
  }

  section('conexoes')
  const clients = await Promise.all(Array.from({ length: CLIENTS }, (_, i) => openClient(i)))
  check(
    `${CLIENTS} clientes conectados simultaneamente`,
    clients.every((c) => c.socket.readyState === 1),
  )

  // Baseline DEPOIS de conectar: assim nenhum evento cabe na janela entre o
  // GET e o primeiro listener, e o log sozinho descreve toda a mudanca.
  const baseRes = await api('GET', '/api/board')
  check('GET /api/board (baseline) -> 200', baseRes.status === 200)
  const baseline = {
    ...baseRes.body,
    lists: byPosition(baseRes.body.lists).map((l) => ({ ...l, cards: byPosition(l.cards) })),
  }
  const trashBefore = (await api('GET', '/api/trash')).body.counts

  // -------------------------------------------------------------------------
  // Rajada de mutacoes. As chamadas de cada lote saem em paralelo de proposito:
  // e onde nascem os empates de position e as corridas de broadcast.
  // -------------------------------------------------------------------------
  section('rajada de mutacoes')
  let mutations = 0
  const failed = []

  const fire = async (label, calls) => {
    const results = await Promise.all(calls.map((c) => c()))
    results.forEach((r, i) => {
      mutations++
      if (r.status >= 400) failed.push(`${label}#${i} -> ${r.status} ${JSON.stringify(r.body)}`)
    })
    return results
  }

  const listA = (await api('POST', '/api/lists', { title: 'ws-stress A' })).body
  const listB = (await api('POST', '/api/lists', { title: 'ws-stress B' })).body
  mutations += 2
  if (!listA?.id || !listB?.id) {
    console.error('nao consegui criar as listas de trabalho')
    process.exit(1)
  }

  // 1) 8 cards em paralelo na mesma lista: POST calcula position como
  //    "ultima + 1", entao paralelismo aqui e o caso classico de empate.
  const cardsA = (
    await fire(
      'create A',
      Array.from({ length: 8 }, (_, i) => () =>
        api('POST', '/api/cards', { listId: listA.id, title: `stress A${i}`, description: `d${i}` }),
      ),
    )
  ).map((r) => r.body)

  // 2) 4 cards em paralelo na outra lista.
  const cardsB = (
    await fire(
      'create B',
      Array.from({ length: 4 }, (_, i) => () =>
        api('POST', '/api/cards', { listId: listB.id, title: `stress B${i}` }),
      ),
    )
  ).map((r) => r.body)

  // 3) 6 moves em paralelo de A para B, com positions fracionarias calculadas
  //    pelo cliente (como manda o CLAUDE.md).
  await fire(
    'move A->B',
    cardsA.slice(0, 6).map((card, i) => () =>
      api('PATCH', `/api/cards/${card.id}/move`, {
        listId: listB.id,
        position: 100 + i / 8,
      }),
    ),
  )

  // 4) 4 edicoes de titulo em paralelo.
  await fire(
    'patch',
    cardsB.map((card, i) => () =>
      api('PATCH', `/api/cards/${card.id}`, { title: `stress B${i} editado` }),
    ),
  )

  // 5) 3 deletes em paralelo (vao para a lixeira) + 3 restores em paralelo.
  //    Restore emite card.created: o reducer faz upsert por id e o card volta.
  const doomed = cardsA.slice(6)
  await fire('delete', [
    ...doomed.map((card) => () => api('DELETE', `/api/cards/${card.id}`)),
    () => api('DELETE', `/api/cards/${cardsB[0].id}`),
  ])
  await fire('restore', [
    ...doomed.map((card) => () => api('POST', `/api/trash/cards/${card.id}/restore`)),
    () => api('POST', `/api/trash/cards/${cardsB[0].id}/restore`),
  ])

  // 6) Lista inteira para a lixeira e de volta. O list.created do restore vem
  //    com cards[] populado -- se nao viesse, o reducer sobrescreveria a lista
  //    com uma vazia e a convergencia no fim do script acusaria.
  await fire('delete lista B', [() => api('DELETE', `/api/lists/${listB.id}`)])
  await fire('restore lista B', [() => api('POST', `/api/trash/lists/${listB.id}/restore`)])

  // 7) Ultimo lote: 4 moves em paralelo para dentro de A, empatando de proposito
  //    duas positions para exercitar o desempate por id.
  await fire(
    'move B->A',
    cardsB.map((card, i) => () =>
      api('PATCH', `/api/cards/${card.id}/move`, {
        listId: listA.id,
        position: i < 2 ? -5 : -5 + i,
      }),
    ),
  )

  // 8) Reordenar a propria lista A.
  await fire('move lista', [
    () => api('PATCH', `/api/lists/${listA.id}`, { position: listB.position - 0.5 }),
  ])

  console.log(`  ${mutations} mutacoes disparadas`)
  check('nenhuma mutacao da rajada falhou', failed.length === 0, failed.join(' | '))

  await settle(clients)

  // -------------------------------------------------------------------------
  section('broadcast identico para todos os clientes')
  const counts = clients.map((c) => c.events.length)
  check(
    `todos os ${CLIENTS} clientes receberam a mesma quantidade de eventos`,
    new Set(counts).size === 1,
    `contagens: ${counts.join(', ')}`,
  )
  check('o broadcast chegou (contagem > 0)', counts[0] > 0, `${counts[0]} eventos`)
  check(
    'a quantidade de eventos cobre todas as mutacoes',
    counts[0] >= mutations,
    `${counts[0]} eventos para ${mutations} mutacoes`,
  )

  const reference = clients[0].raw.join('\n')
  const divergent = clients
    .slice(1)
    .filter((c) => c.raw.join('\n') !== reference)
    .map((c) => c.index)
  check(
    'todos os clientes receberam a MESMA sequencia, na mesma ordem',
    divergent.length === 0,
    divergent.length ? `clientes divergentes: ${divergent.join(', ')}` : '',
  )

  // Se a ordem divergiu, o conjunto ainda pode ser igual -- vale distinguir os
  // dois casos: conjunto diferente e evento perdido; ordem diferente e corrida.
  if (divergent.length > 0) {
    const asSet = (c) => [...c.raw].sort().join('\n')
    const refSet = asSet(clients[0])
    check(
      '...ao menos o CONJUNTO de eventos e o mesmo',
      clients.every((c) => asSet(c) === refSet),
      'ha cliente com evento faltando ou sobrando, nao so ordem trocada',
    )
  }

  const log = clients[0].events
  const byType = log.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {})
  console.log(
    `  eventos: ${Object.entries(byType)
      .map(([t, n]) => `${t}=${n}`)
      .join(' ')}`,
  )

  // Todo card criado tem que ter aparecido no broadcast.
  const created = new Set(
    log.filter((e) => e.type === 'card.created').map((e) => e.payload.id),
  )
  const missing = [...cardsA, ...cardsB].filter((c) => !created.has(c.id)).map((c) => c.id)
  check(
    'todo card criado pelo HTTP apareceu como card.created no WS',
    missing.length === 0,
    missing.join(', '),
  )
  check(
    'todo card.moved traz exatamente { id, listId, position }',
    log
      .filter((e) => e.type === 'card.moved')
      .every((e) => Object.keys(e.payload).sort().join(',') === 'id,listId,position'),
  )

  // -------------------------------------------------------------------------
  section('idempotencia do reducer')
  const once = replay(baseline, log)
  const doubled = replayDoubled(baseline, log)
  check(
    'aplicar cada evento duas vezes == aplicar uma vez',
    same(snapshot(once), snapshot(doubled)),
    firstDiff(snapshot(once), snapshot(doubled)) ?? '',
  )

  const twice = replay(once, log)
  check(
    'reaplicar o log inteiro converge para o mesmo estado',
    same(snapshot(once), snapshot(twice)),
    firstDiff(snapshot(once), snapshot(twice)) ?? '',
  )

  // Ordem embaralhada NAO precisa convergir (card.moved depende do estado
  // anterior do card), entao nao ha assercao aqui -- so a nota de que `stale`
  // e o mecanismo que cobre esse caso no frontend.
  check(
    'o reducer nao precisou pedir recarga (stale) para dar conta do log',
    once.stale !== true,
    'algum evento falou de uma lista/card desconhecido: ver o `stale` em useBoard.ts',
  )

  // -------------------------------------------------------------------------
  section('convergencia: eventos vs GET /api/board')
  const freshRes = await api('GET', '/api/board')
  const fresh = freshRes.body
  const derived = snapshot(once)
  const server = snapshot(fresh)
  check(
    'estado derivado so dos eventos == GET /api/board fresco',
    same(derived, server),
    firstDiff(derived, server) ?? '',
  )
  check(
    'a contagem da lixeira derivada de trash.updated bate com o GET',
    same(derived.trash, server.trash),
    `derivado ${JSON.stringify(derived.trash)} vs servidor ${JSON.stringify(server.trash)}`,
  )

  // Empates de position sao tolerados (o servidor desempata por id), mas vale
  // registrar quantos a rajada produziu -- e a metrica que diz se o POST
  // paralelo esta correndo perigo.
  const ties = server.lists.reduce((n, l) => {
    const seen = new Map()
    for (const c of l.cards) seen.set(c.position, (seen.get(c.position) ?? 0) + 1)
    return n + [...seen.values()].filter((v) => v > 1).length
  }, 0)
  console.log(`  ${ties} grupo(s) de position empatada apos a rajada (tolerado: desempate por id)`)

  // -------------------------------------------------------------------------
  // A rajada acima produziu empates de position. Empate sozinho o servidor
  // tolera (desempata por id), mas ele nao e inofensivo: `POST /api/cards`
  // calcula "ultima + 1" com um SELECT seguido de um INSERT fora de qualquer
  // transacao, entao N criacoes concorrentes leem a MESMA "ultima" e gravam a
  // MESMA position. E a partir de dois cards empatados o drag-and-drop deixa de
  // funcionar: `positionFor` devolve (a+b)/2, que com a === b e o proprio a --
  // o cliente pede uma posicao que nao existe entre os vizinhos, o servidor
  // grava 200 OK, e o card nao sai do lugar.
  section('corrida de position em criacoes concorrentes')
  const raceList = (await api('POST', '/api/lists', { title: 'ws-stress race' })).body
  const racers = (
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        api('POST', '/api/cards', { listId: raceList.id, title: `race ${i}` }),
      ),
    )
  ).map((r) => r.body)
  const racePositions = racers.map((c) => c.position)
  const distinct = new Set(racePositions).size
  check(
    '20 POST /api/cards concorrentes geram 20 positions distintas',
    distinct === racePositions.length,
    `so ${distinct} distintas: ${racePositions.join(',')} -- read-modify-write sem transacao em POST /api/cards`,
  )

  // A consequencia, medida em vez de deduzida: soltar um card entre dois
  // vizinhos empatados nao muda a ordem.
  const tied = [...racePositions].sort((x, y) => x - y).find((p, i, arr) => arr[i + 1] === p)
  if (tied !== undefined) {
    const neighbours = racers.filter((c) => c.position === tied)
    const outsider = racers.find((c) => c.position !== tied)
    const midpoint = (neighbours[0].position + neighbours[1].position) / 2
    const attempt = await api('PATCH', `/api/cards/${outsider.id}/move`, {
      listId: raceList.id,
      position: midpoint,
    })
    check(
      'soltar um card ENTRE dois vizinhos empatados produz uma position distinta',
      attempt.status === 200 && attempt.body.position !== neighbours[0].position,
      `pedido ${midpoint}, gravado ${attempt.body?.position}, vizinhos em ${neighbours[0].position} -- o drag responde 200 e nao move nada`,
    )
  }
  await api('DELETE', `/api/lists/${raceList.id}`)
  await api('DELETE', `/api/trash/lists/${raceList.id}`)

  // -------------------------------------------------------------------------
  section('limpeza')
  await api('DELETE', `/api/lists/${listA.id}`)
  await api('DELETE', `/api/lists/${listB.id}`)
  // Purge item a item, nunca DELETE /api/trash: esvaziar a lixeira apagaria
  // tambem o que ja estava la antes do teste. Purgar a lista cascateia nos
  // cards dela, inclusive os que foram para a lixeira por conta propria.
  const purgeA = await api('DELETE', `/api/trash/lists/${listA.id}`)
  const purgeB = await api('DELETE', `/api/trash/lists/${listB.id}`)
  check('listas de trabalho apagadas de vez', purgeA.status === 204 && purgeB.status === 204)

  await settle(clients, 400, 4000)
  const trashAfter = (await api('GET', '/api/trash')).body.counts
  check(
    'a lixeira voltou ao estado anterior ao teste',
    same(trashBefore, trashAfter),
    `antes ${JSON.stringify(trashBefore)} depois ${JSON.stringify(trashAfter)}`,
  )
  const finalBoard = (await api('GET', '/api/board')).body
  check(
    'o board voltou as listas originais',
    same(
      baseline.lists.map((l) => l.id).sort(),
      finalBoard.lists.map((l) => l.id).sort(),
    ),
  )

  for (const c of clients) c.socket.close()
  console.log(failures === 0 ? '\nWS-STRESS OK' : `\nWS-STRESS FALHOU: ${failures} assercao(oes)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('ws-stress explodiu:', e.message)
  process.exit(1)
})
