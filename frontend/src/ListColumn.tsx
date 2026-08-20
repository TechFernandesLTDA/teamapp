import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Card, List } from './types'

export type DropTarget = { listId: string; index: number }

type Props = {
  list: List
  draggingId: string | null
  dropTarget: DropTarget | null
  onDragStart: (cardId: string) => void
  onDragEnd: () => void
  onHover: (target: DropTarget) => void
  onDrop: (list: List, index: number) => void
  onOpenCard: (card: Card) => void
  onAddCard: (listId: string, title: string) => void
  onRename: (list: List, title: string) => void
  onDelete: (list: List) => void
}

/** Metade de cima do card = solta antes dele; metade de baixo = depois. */
function slotFor(event: { clientY: number; currentTarget: Element }, index: number): number {
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientY > box.top + box.height / 2 ? index + 1 : index
}

export function ListColumn(props: Props) {
  const { list, draggingId, dropTarget, onDrop, onHover } = props
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(list.title)
  const [newCard, setNewCard] = useState('')

  const isTarget = (index: number) => dropTarget?.listId === list.id && dropTarget.index === index

  const commitRename = () => {
    const title = draftTitle.trim()
    setRenaming(false)
    if (title && title !== list.title) props.onRename(list, title)
    else setDraftTitle(list.title)
  }

  const submitCard = (e: FormEvent) => {
    e.preventDefault()
    const title = newCard.trim()
    if (!title) return
    props.onAddCard(list.id, title)
    setNewCard('')
  }

  return (
    <section className="window list">
      <div className="title-bar">
        <div className="title-bar-text" onDoubleClick={() => setRenaming(true)}>
          {list.title} ({list.cards.length})
        </div>
        <div className="title-bar-controls">
          <button aria-label="Close" title="Apagar lista" onClick={() => props.onDelete(list)} />
        </div>
      </div>

      {renaming && (
        <div className="rename-row">
          <input
            type="text"
            value={draftTitle}
            autoFocus
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setDraftTitle(list.title)
                setRenaming(false)
              }
            }}
          />
        </div>
      )}

      <div
        className="window-body list-body"
        onDragOver={(e) => {
          // So captura o vazio da lista; sobre um card o handler dele tem prioridade.
          if (list.cards.length === 0) {
            e.preventDefault()
            onHover({ listId: list.id, index: 0 })
          }
        }}
        onDrop={(e) => {
          if (list.cards.length === 0) {
            e.preventDefault()
            onDrop(list, 0)
          }
        }}
      >
        {list.cards.length === 0 && (
          <p className={isTarget(0) ? 'empty drop-here' : 'empty'}>(vazia)</p>
        )}

        {list.cards.map((card, index) => (
          <article
            key={card.id}
            className={
              'card' +
              (draggingId === card.id ? ' dragging' : '') +
              (isTarget(index) ? ' drop-here' : '')
            }
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              // Firefox so inicia o drag se houver payload.
              e.dataTransfer.setData('text/plain', card.id)
              props.onDragStart(card.id)
            }}
            onDragEnd={props.onDragEnd}
            onDragOver={(e) => {
              e.preventDefault()
              onHover({ listId: list.id, index: slotFor(e, index) })
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDrop(list, slotFor(e, index))
            }}
            onDoubleClick={() => props.onOpenCard(card)}
            title="Duplo clique para editar"
          >
            <span className="card-title">{card.title}</span>
            {card.description && <span className="card-badge" title={card.description} />}
          </article>
        ))}

        {list.cards.length > 0 && (
          // Alvo explicito para soltar no fim: sem ele o ultimo slot nao tem indicador.
          <div
            className={isTarget(list.cards.length) ? 'drop-end drop-here' : 'drop-end'}
            onDragOver={(e) => {
              e.preventDefault()
              onHover({ listId: list.id, index: list.cards.length })
            }}
            onDrop={(e) => {
              e.preventDefault()
              onDrop(list, list.cards.length)
            }}
          />
        )}

        <form className="add-card" onSubmit={submitCard}>
          <input
            type="text"
            value={newCard}
            placeholder="Novo card..."
            onChange={(e) => setNewCard(e.target.value)}
          />
          <button type="submit" disabled={!newCard.trim()}>
            +
          </button>
        </form>
      </div>
    </section>
  )
}
