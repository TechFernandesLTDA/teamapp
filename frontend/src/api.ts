import type { Board, Card, List, Trash, TrashCounts } from './types'

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
  moveList: (id: string, position: number) =>
    request<List>('PATCH', `/api/lists/${id}`, { position }),
  deleteList: (id: string) => request<void>('DELETE', `/api/lists/${id}`),

  createCard: (listId: string, title: string) =>
    request<Card>('POST', '/api/cards', { listId, title }),
  updateCard: (id: string, patch: { title?: string; description?: string }) =>
    request<Card>('PATCH', `/api/cards/${id}`, patch),
  moveCard: (id: string, listId: string, position: number) =>
    request<Card>('PATCH', `/api/cards/${id}/move`, { listId, position }),
  // Manda para a lixeira -- nao apaga. O evento continua sendo card.deleted { id }.
  deleteCard: (id: string) => request<void>('DELETE', `/api/cards/${id}`),

  // --- Lixeira ---
  getTrash: () => request<Trash>('GET', '/api/trash'),
  // Restaurar reusa card.created/list.created: o reducer ja faz upsert por id,
  // entao o item reaparece no board sem tratamento especial.
  restoreCard: (id: string) => request<Card>('POST', `/api/trash/cards/${id}/restore`),
  restoreList: (id: string) => request<List>('POST', `/api/trash/lists/${id}/restore`),
  purgeCard: (id: string) => request<void>('DELETE', `/api/trash/cards/${id}`),
  purgeList: (id: string) => request<void>('DELETE', `/api/trash/lists/${id}`),
  emptyTrash: () => request<{ deleted: TrashCounts }>('DELETE', '/api/trash'),
}

/**
 * Position fracionaria: uma unica linha e gravada por drag -- ver CLAUDE.md.
 * `siblings` e a sequencia de destino ja ordenada e ja *sem* o item arrastado;
 * `index` e o slot onde ele cai. Serve para cards e para listas -- as duas usam
 * a mesma semantica de position, entao a matematica e uma so.
 */
export function positionFor(siblings: { position: number }[], index: number): number {
  const before = siblings[index - 1]
  const after = siblings[index]

  if (!before && !after) return 0
  if (!before) return after.position - 1
  if (!after) return before.position + 1
  return (before.position + after.position) / 2
}
