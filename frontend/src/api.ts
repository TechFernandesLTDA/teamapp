import type { Board, Card, List } from './types'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_URL + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text()
    let message = detail
    try {
      message = JSON.parse(detail).error ?? detail
    } catch {
      /* resposta nao-JSON: usa o texto cru */
    }
    throw new Error(`${method} ${path} falhou (${res.status}): ${message}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  getBoard: () => request<Board>('GET', '/api/board'),

  createList: (title: string) => request<List>('POST', '/api/lists', { title }),
  renameList: (id: string, title: string) => request<List>('PATCH', `/api/lists/${id}`, { title }),
  deleteList: (id: string) => request<void>('DELETE', `/api/lists/${id}`),

  createCard: (listId: string, title: string) =>
    request<Card>('POST', '/api/cards', { listId, title }),
  updateCard: (id: string, patch: { title?: string; description?: string }) =>
    request<Card>('PATCH', `/api/cards/${id}`, patch),
  moveCard: (id: string, listId: string, position: number) =>
    request<Card>('PATCH', `/api/cards/${id}/move`, { listId, position }),
  deleteCard: (id: string) => request<void>('DELETE', `/api/cards/${id}`),
}

/**
 * Position fracionaria: uma unica linha e gravada por drag -- ver CLAUDE.md.
 * `cards` e a lista de destino ja ordenada; `index` e o slot onde o card cai.
 */
export function positionFor(cards: Card[], index: number): number {
  const before = cards[index - 1]
  const after = cards[index]

  if (!before && !after) return 0
  if (!before) return after.position - 1
  if (!after) return before.position + 1
  return (before.position + after.position) / 2
}
