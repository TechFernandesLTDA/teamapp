import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api, positionFor } from './api'
import { useBoard } from './useBoard'
import { CardDialog } from './CardDialog'
import { ListColumn } from './ListColumn'
import type { DropTarget } from './ListColumn'
import type { List } from './types'

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="window crash">
      <div className="title-bar">
        <div className="title-bar-text">TeamApp 95</div>
      </div>
      <div className="window-body">{children}</div>
    </div>
  )
}

export default function App() {
  const { board, error, connected, run, setError } = useBoard()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [newList, setNewList] = useState('')

  if (error && !board) {
    return (
      <Frame>
        <p>Nao foi possivel falar com o servidor.</p>
        <p className="crash-detail">{error}</p>
        <button onClick={() => window.location.reload()}>Tentar novamente</button>
      </Frame>
    )
  }

  if (!board) return <Frame>Carregando...</Frame>

  // Derivado do board, nao copiado: o eco do WebSocket atualiza o dialogo aberto.
  const openCard = board.lists.flatMap((l) => l.cards).find((c) => c.id === openCardId) ?? null

  const submitList = (e: FormEvent) => {
    e.preventDefault()
    const title = newList.trim()
    if (!title) return
    void run(() => api.createList(title))
    setNewList('')
  }

  const dropCard = (list: List, index: number) => {
    if (!draggingId) return
    const cardId = draggingId
    // Tirar o proprio card antes de calcular evita que ele vire vizinho de si mesmo
    // -- sem isso, arrastar um slot para baixo cai de volta no lugar de origem.
    const neighbours = list.cards.filter((c) => c.id !== cardId)
    const slot = Math.min(index, neighbours.length)
    void run(() => api.moveCard(cardId, list.id, positionFor(neighbours, slot)))
    setDraggingId(null)
    setDropTarget(null)
  }

  const cardCount = board.lists.reduce((n, l) => n + l.cards.length, 0)

  return (
    <div className="desktop">
      <div className="board-header">
        <h1>{board.title}</h1>
        <span className={connected ? 'status online' : 'status offline'}>
          {connected ? 'conectado' : 'reconectando...'}
        </span>
        <form className="add-list" onSubmit={submitList}>
          <input
            type="text"
            value={newList}
            placeholder="Nova lista..."
            onChange={(e) => setNewList(e.target.value)}
          />
          <button type="submit" disabled={!newList.trim()}>
            Criar
          </button>
        </form>
      </div>

      {error && (
        <div className="window error-bar">
          <div className="window-body">
            <span>{error}</span>
            <button onClick={() => setError(null)}>OK</button>
          </div>
        </div>
      )}

      <div className="board">
        {board.lists.map((list) => (
          <ListColumn
            key={list.id}
            list={list}
            draggingId={draggingId}
            dropTarget={dropTarget}
            onDragStart={setDraggingId}
            onDragEnd={() => {
              setDraggingId(null)
              setDropTarget(null)
            }}
            onHover={setDropTarget}
            onDrop={dropCard}
            onOpenCard={(card) => setOpenCardId(card.id)}
            onAddCard={(listId, title) => void run(() => api.createCard(listId, title))}
            onRename={(l, title) => void run(() => api.renameList(l.id, title))}
            onDelete={(l) => {
              if (window.confirm(`Apagar a lista "${l.title}" e seus ${l.cards.length} card(s)?`)) {
                void run(() => api.deleteList(l.id))
              }
            }}
          />
        ))}

        {board.lists.length === 0 && (
          <p className="board-empty">Nenhuma lista ainda. Crie a primeira ali em cima.</p>
        )}
      </div>

      {openCard && (
        <CardDialog
          card={openCard}
          onSave={(patch) => void run(() => api.updateCard(openCard.id, patch))}
          onDelete={() => void run(() => api.deleteCard(openCard.id))}
          onClose={() => setOpenCardId(null)}
        />
      )}

      <div className="taskbar">
        <button className="start">Iniciar</button>
        <span className="taskbar-item">TeamApp 95</span>
        <span className="tray">
          {board.lists.length} listas · {cardCount} cards
        </span>
      </div>
    </div>
  )
}
