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
}

export type ServerEvent =
  | { type: 'list.created'; payload: List }
  | { type: 'list.updated'; payload: List }
  | { type: 'list.deleted'; payload: { id: string } }
  | { type: 'card.created'; payload: Card }
  | { type: 'card.updated'; payload: Card }
  | { type: 'card.moved'; payload: { id: string; listId: string; position: number } }
  | { type: 'card.deleted'; payload: { id: string } }
