import { useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import type { Card, List } from './types'

export type CardDropTarget = { listId: string; index: number }

type Props = {
  list: List
  index: number
  /** Card sendo arrastado, ou null. Um drag de lista nao preenche este campo. */
  draggingCardId: string | null
  draggingListId: string | null
  cardDropTarget: CardDropTarget | null
  /** Ids que casam com a busca, ou null quando nao ha busca ativa. */
  matches: Set<string> | null
  /** Slot (indice no array de listas) onde a lista arrastada vai cair. */
  listDropSlot: number | null
  isLast: boolean
  onCardDragStart: (cardId: string) => void
  onCardHover: (target: CardDropTarget) => void
  onCardDrop: (list: List, index: number) => void
  onListDragStart: (listId: string) => void
  onListHover: (slot: number) => void
  onListDrop: (slot: number) => void
  onDragEnd: () => void
  onOpenCard: (card: Card) => void
  onAddCard: (listId: string, title: string) => void
  onRename: (list: List, title: string) => void
  onDelete: (list: List) => void
}

/** Metade de cima do card = solta antes dele; metade de baixo = depois. */
function cardSlot(event: DragEvent, index: number): number {
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientY > box.top + box.height / 2 ? index + 1 : index
}

export function ListColumn(props: Props) {
  const { list, index, draggingCardId, draggingListId, cardDropTarget, listDropSlot, matches } =
    props
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(list.title)
  const [newCard, setNewCard] = useState('')

  const isCardTarget = (i: number) =>
    cardDropTarget?.listId === list.id && cardDropTarget.index === i

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

  // Metade esquerda da lista = solta antes dela; metade direita = depois.
  const listSlot = (e: DragEvent) => {
    const box = e.currentTarget.getBoundingClientRect()
    return e.clientX > box.left + box.width / 2 ? index + 1 : index
  }

  const className = [
    'window',
    'list',
    draggingListId === list.id ? 'dragging' : '',
    listDropSlot === index ? 'drop-before' : '',
    listDropSlot === index + 1 && props.isLast ? 'drop-after' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={className}
      // So reage quando o que esta vindo e uma lista; card tem handlers proprios.
      onDragOver={(e) => {
        if (!draggingListId) return
        e.preventDefault()
        props.onListHover(listSlot(e))
      }}
      onDrop={(e) => {
        if (!draggingListId) return
        e.preventDefault()
        props.onListDrop(listSlot(e))
      }}
    >
      <div
        className="title-bar"
        draggable
        title="Arraste a barra para reordenar a lista"
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', list.id)
          props.onListDragStart(list.id)
        }}
        onDragEnd={props.onDragEnd}
      >
        <div
          className="title-bar-text"
          // Re-sincroniza antes de abrir: o componente nao remonta quando o titulo
          // muda, entao sem isso um rename feito em outra aba seria escrito de volta.
          onDoubleClick={() => {
            setDraftTitle(list.title)
            setRenaming(true)
          }}
        >
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
        // Os cards param a propagacao, entao chegar aqui significa area livre da
        // lista (vazia, ou o espaco embaixo do ultimo card): cai no fim.
        onDragOver={(e) => {
          if (!draggingCardId) return
          e.preventDefault()
          e.stopPropagation()
          props.onCardHover({ listId: list.id, index: list.cards.length })
        }}
        onDrop={(e) => {
          if (!draggingCardId) return
          e.preventDefault()
          e.stopPropagation()
          props.onCardDrop(list, list.cards.length)
        }}
      >
        {list.cards.length === 0 && (
          <p className={isCardTarget(0) ? 'empty drop-here' : 'empty'}>(vazia)</p>
        )}

        {list.cards.map((card, i) => (
          <article
            key={card.id}
            className={
              'card' +
              (draggingCardId === card.id ? ' dragging' : '') +
              (isCardTarget(i) ? ' drop-here' : '') +
              // Busca realca em vez de filtrar: esconder os que nao casam mudaria
              // os vizinhos e quebraria o calculo de position no drop.
              (matches === null ? '' : matches.has(card.id) ? ' card-match' : ' card-dimmed')
            }
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              // Firefox so inicia o drag se houver payload.
              e.dataTransfer.setData('text/plain', card.id)
              props.onCardDragStart(card.id)
            }}
            onDragEnd={props.onDragEnd}
            onDragOver={(e) => {
              if (!draggingCardId) return
              e.preventDefault()
              e.stopPropagation()
              props.onCardHover({ listId: list.id, index: cardSlot(e, i) })
            }}
            onDrop={(e) => {
              if (!draggingCardId) return
              e.preventDefault()
              e.stopPropagation()
              props.onCardDrop(list, cardSlot(e, i))
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
            className={isCardTarget(list.cards.length) ? 'drop-end drop-here' : 'drop-end'}
            onDragOver={(e) => {
              if (!draggingCardId) return
              e.preventDefault()
              e.stopPropagation()
              props.onCardHover({ listId: list.id, index: list.cards.length })
            }}
            onDrop={(e) => {
              if (!draggingCardId) return
              e.preventDefault()
              e.stopPropagation()
              props.onCardDrop(list, list.cards.length)
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
