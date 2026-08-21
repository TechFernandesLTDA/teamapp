import { useCallback, useEffect, useRef, useState } from 'react'
import { api, WS_URL } from './api'
import type { Board, Card, List, ServerEvent } from './types'

const byPosition = <T extends { position: number }>(items: T[]) =>
  [...items].sort((a, b) => a.position - b.position)

/**
 * Aplica um evento do servidor como upsert idempotente por id.
 * Quem originou a mutacao ve a resposta HTTP E o eco do broadcast, entao
 * aplicar duas vezes tem que dar o mesmo resultado -- ver CLAUDE.md.
 */
function reduce(board: Board, event: ServerEvent): Board {
  switch (event.type) {
    case 'list.created':
    case 'list.updated': {
      const incoming = event.payload
      const exists = board.lists.some((l) => l.id === incoming.id)
      const lists = exists
        ? board.lists.map((l) => {
            if (l.id !== incoming.id) return l
            // `?? l.cards` nao servia: [] nao e nullish, entao um list.updated com
            // cards vazio zerava a lista. Um payload SEM a chave preserva o local;
            // com a chave (mesmo vazia) manda -- e o caso do restore, que traz os
            // cards de volta de proposito.
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
      // Lista desconhecida: mesma situacao do card.moved orfao. O card nao tem
      // onde entrar, entao marca para recarregar em vez de sumir.
      if (!board.lists.some((l) => l.id === card.listId)) return { ...board, stale: true }
      const lists = board.lists.map((list) => {
        const without = list.cards.filter((c) => c.id !== card.id)
        if (list.id !== card.listId) {
          // Card saiu desta lista (ou nunca esteve): so garante que nao ficou duplicado.
          return without.length === list.cards.length ? list : { ...list, cards: without }
        }
        return { ...list, cards: byPosition([...without, card]) }
      })
      return { ...board, lists }
    }

    case 'card.moved': {
      const { id, listId, position } = event.payload
      const existing = board.lists.flatMap((l) => l.cards).find((c) => c.id === id)
      // Card que este cliente nao conhece: aconteceu fora da nossa visao (criado
      // e movido entre dois GETs, ou restaurado da lixeira). Descartar em silencio
      // deixava o board errado ate o proximo reload -- sinaliza para recarregar.
      if (!existing) return { ...board, stale: true }
      const moved: Card = { ...existing, listId, position }
      const lists = board.lists.map((list) => {
        const without = list.cards.filter((c) => c.id !== id)
        if (list.id !== listId) {
          return without.length === list.cards.length ? list : { ...list, cards: without }
        }
        return { ...list, cards: byPosition([...without, moved]) }
      })
      return { ...board, lists }
    }

    // So a contagem muda -- o conteudo da lixeira vem de GET /api/trash quando
    // a janela abre. Nao ha nada de board para reduzir aqui.
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

export function useBoard() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)

  // Geracao do load: um GET /api/board em voo pode terminar DEPOIS de eventos WS
  // que ja aplicamos, e sobrescrever o estado mais novo com o mais velho. A janela
  // e pequena mas real justamente na reconexao, que e quando o load() roda.
  const generation = useRef(0)

  const load = useCallback(async () => {
    const mine = ++generation.current
    try {
      const fresh = await api.getBoard()
      // Outro load comecou enquanto este estava em voo: a resposta dele e mais
      // nova que a nossa, entao esta aqui esta obsoleta.
      if (mine !== generation.current) return
      fresh.lists = byPosition(fresh.lists).map((l: List) => ({ ...l, cards: byPosition(l.cards) }))
      setBoard(fresh)
      setError(null)
    } catch (e) {
      if (mine !== generation.current) return
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // O reducer marca `stale` quando recebe um evento sobre algo que ele nao
  // conhece (ver card.moved/card.created orfaos). Ele nao pode chamar load()
  // sozinho -- e uma funcao pura -- entao o efeito faz a recarga.
  useEffect(() => {
    if (board?.stale) void load()
  }, [board?.stale, load])

  useEffect(() => {
    let closedByUnmount = false
    let retry: ReturnType<typeof setTimeout>
    let attempt = 0

    const connect = () => {
      const socket = new WebSocket(WS_URL)
      socketRef.current = socket

      socket.onopen = () => {
        attempt = 0
        setConnected(true)
        // Eventos perdidos enquanto a conexao estava caida nao sao reenviados.
        void load()
      }

      socket.onmessage = (message) => {
        const event = JSON.parse(message.data) as ServerEvent
        setBoard((current) => (current ? reduce(current, event) : current))
      }

      socket.onclose = () => {
        setConnected(false)
        if (closedByUnmount) return
        attempt++
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt, 15000))
      }

      socket.onerror = () => socket.close()
    }

    connect()

    return () => {
      closedByUnmount = true
      clearTimeout(retry)
      socketRef.current?.close()
    }
  }, [load])

  // Toda mutacao volta pelo broadcast, entao a UI so precisa registrar o erro:
  // o estado correto chega pelo evento.
  const run = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  return { board, error, connected, run, reload: load, setError }
}
