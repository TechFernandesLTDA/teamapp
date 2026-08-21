// Espelha docs/API.md. Se divergir, docs/API.md e a autoridade.
export type Card = {
  id: string
  listId: string
  title: string
  description: string
  position: number
}

export type List = {
  id: string
  boardId: string
  title: string
  position: number
  cards: Card[]
}

export type Board = {
  id: string
  slug: string
  title: string
  lists: List[]
  /** Contagem da lixeira, para o icone nascer no estado certo sem um GET extra. */
  trash: TrashCounts
  /** Marcado pelo reducer quando chega evento sobre algo que ele nao conhece: pede reload. */
  stale?: boolean
}

export type ServerEvent =
  | { type: 'list.created'; payload: List }
  | { type: 'list.updated'; payload: List }
  | { type: 'list.deleted'; payload: { id: string } }
  | { type: 'card.created'; payload: Card }
  | { type: 'card.updated'; payload: Card }
  | { type: 'card.moved'; payload: { id: string; listId: string; position: number } }
  | { type: 'card.deleted'; payload: { id: string } }
  // So a contagem: o conteudo vem de GET /api/trash quando a janela abre.
  | { type: 'trash.updated'; payload: TrashCounts }

// --- Lixeira ---
// DELETE de card/lista e soft delete: o item vai para a lixeira, de onde volta.
// Ver "A Lixeira" em docs/API.md.

export type TrashCounts = { cards: number; lists: number }

export type TrashedCard = Card & {
  deletedAt: string
  /** `deleted: true` => restaurar este card retorna 409: a lista de origem tambem foi para a lixeira. */
  originalList: { id: string; title: string; deleted: boolean }
}

export type TrashedList = Omit<List, 'cards'> & {
  deletedAt: string
  /** Quantos cards voltam junto se a lista for restaurada. Os que foram jogados fora sozinhos nao contam. */
  cardCount: number
}

export type Trash = { cards: TrashedCard[]; lists: TrashedList[]; counts: TrashCounts }
