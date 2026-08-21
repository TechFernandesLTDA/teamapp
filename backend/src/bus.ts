import type { WebSocket } from 'ws'

export type EventType =
  | 'list.created'
  | 'list.updated'
  | 'list.deleted'
  | 'card.created'
  | 'card.updated'
  | 'card.moved'
  | 'card.deleted'
  // Lixeira: o payload e so a contagem ({ cards, lists }), para o icone do desktop
  // saber se ela esta cheia. O conteudo vem de GET /api/trash quando a janela abre.
  | 'trash.updated'

const clients = new Set<WebSocket>()

export function addClient(socket: WebSocket) {
  clients.add(socket)
  socket.on('close', () => clients.delete(socket))
  socket.on('error', () => clients.delete(socket))
}

export function clientCount() {
  return clients.size
}

/**
 * Envia para todos os clientes, inclusive quem originou a mutacao.
 * O cliente aplica eventos como upsert idempotente por id -- ver CLAUDE.md.
 */
export function broadcast(type: EventType, payload: unknown) {
  const message = JSON.stringify({ type, payload })
  for (const socket of clients) {
    if (socket.readyState !== 1) {
      clients.delete(socket)
      continue
    }
    try {
      socket.send(message)
    } catch {
      clients.delete(socket)
    }
  }
}
