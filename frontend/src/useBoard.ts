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
        ? board.lists.map((l) =>
            // Preserva os cards locais: list.updated pode nao trazer os mesmos.
            l.id === incoming.id ? { ...l, ...incoming, cards: incoming.cards ?? l.cards } : l,
          )
        : [...board.lists, { ...incoming, cards: incoming.cards ?? [] }]
      return { ...board, lists: byPosition(lists) }
    }

    case 'list.deleted':
      return { ...board, lists: board.lists.filter((l) => l.id !== event.payload.id) }

    case 'card.created':
    case 'card.updated': {
      const card = event.payload
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
      if (!existing) return board
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

  const load = useCallback(async () => {
    try {
      const fresh = await api.getBoard()
      fresh.lists = byPosition(fresh.lists).map((l: List) => ({ ...l, cards: byPosition(l.cards) }))
      setBoard(fresh)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
