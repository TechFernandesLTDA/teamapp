import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api, API_URL, positionFor } from './api'
import { useBoard } from './useBoard'
import { CardDialog } from './CardDialog'
import { ConfirmDialog } from './ConfirmDialog'
import type { Confirmation } from './ConfirmDialog'
import { ListColumn } from './ListColumn'
import type { CardDropTarget } from './ListColumn'
import { Modal } from './Modal'
import type { List } from './types'

/** O que esta sendo arrastado. Card e lista compartilham a tela, nao o alvo. */
type Drag = { kind: 'card'; id: string } | { kind: 'list'; id: string } | null

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
  const { board, error, connected, run, reload, setError } = useBoard()
  const [drag, setDrag] = useState<Drag>(null)
  const [cardDropTarget, setCardDropTarget] = useState<CardDropTarget | null>(null)
  const [listDropSlot, setListDropSlot] = useState<number | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [newList, setNewList] = useState('')
  const [startOpen, setStartOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  // Um clique em qualquer lugar fecha o menu Iniciar, como no Windows 95.
  useEffect(() => {
    if (!startOpen) return
    const close = () => setStartOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [startOpen])

  if (error && !board) {
    return (
      <Frame>
        <p>Nao foi possivel falar com o servidor.</p>
        <p className="crash-detail">{error}</p>
        <button onClick={() => void reload()}>Tentar novamente</button>
      </Frame>
    )
  }

  if (!board) return <Frame>Carregando...</Frame>

  // Derivado do board, nao copiado: o eco do WebSocket atualiza o dialogo aberto.
  const openCard = board.lists.flatMap((l) => l.cards).find((c) => c.id === openCardId) ?? null

  const endDrag = () => {
    setDrag(null)
    setCardDropTarget(null)
    setListDropSlot(null)
  }

  const submitList = (e: FormEvent) => {
    e.preventDefault()
    const title = newList.trim()
    if (!title) return
    void run(() => api.createList(title))
    setNewList('')
  }

  const dropCard = (list: List, index: number) => {
    if (drag?.kind !== 'card') return
    const cardId = drag.id
    // Tirar o proprio card antes de calcular evita que ele vire vizinho de si mesmo
    // -- sem isso, arrastar um slot para baixo cai de volta no lugar de origem.
    const neighbours = list.cards.filter((c) => c.id !== cardId)
    const slot = Math.min(index, neighbours.length)
    void run(() => api.moveCard(cardId, list.id, positionFor(neighbours, slot)))
    endDrag()
  }

  const dropList = (slot: number) => {
    if (drag?.kind !== 'list') return
    const listId = drag.id
    const neighbours = board.lists.filter((l) => l.id !== listId)
    // O slot veio do array completo; sem a lista arrastada tudo depois dela anda um.
    const from = board.lists.findIndex((l) => l.id === listId)
    const target = Math.min(slot > from ? slot - 1 : slot, neighbours.length)
    if (from !== -1 && (target === from || neighbours.length === 0)) return endDrag()
    void run(() => api.moveList(listId, positionFor(neighbours, target)))
    endDrag()
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

      <div className="board" onDragEnd={endDrag}>
        {board.lists.map((list, index) => (
          <ListColumn
            key={list.id}
            list={list}
            index={index}
            isLast={index === board.lists.length - 1}
            draggingCardId={drag?.kind === 'card' ? drag.id : null}
            draggingListId={drag?.kind === 'list' ? drag.id : null}
            cardDropTarget={cardDropTarget}
            listDropSlot={listDropSlot}
            onCardDragStart={(id) => setDrag({ kind: 'card', id })}
            onListDragStart={(id) => setDrag({ kind: 'list', id })}
            onCardHover={setCardDropTarget}
            onListHover={setListDropSlot}
            onCardDrop={dropCard}
            onListDrop={dropList}
            onDragEnd={endDrag}
            onOpenCard={(card) => setOpenCardId(card.id)}
            onAddCard={(listId, title) => void run(() => api.createCard(listId, title))}
            onRename={(l, title) => void run(() => api.renameList(l.id, title))}
            onDelete={(l) =>
              setConfirmation({
                title: 'Apagar lista',
                message: `Apagar "${l.title}" e seus ${l.cards.length} card(s)? Isso nao volta.`,
                onYes: () => void run(() => api.deleteList(l.id)),
              })
            }
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
          onClose={() => setOpenCardId(null)}
          onDelete={() =>
            setConfirmation({
              title: 'Apagar card',
              message: `Apagar o card "${openCard.title}"?`,
              onYes: () => {
                void run(() => api.deleteCard(openCard.id))
                setOpenCardId(null)
              },
            })
          }
        />
      )}

      {confirmation && (
        <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
      )}

      {aboutOpen && (
        <Modal title="Sobre o TeamApp 95" onClose={() => setAboutOpen(false)} width={300}>
          <p>
            <strong>TeamApp 95</strong>
          </p>
          <p>Um quadro estilo Trello com cara de Windows 95.</p>
          <ul className="about-facts">
            <li>API: {API_URL}</li>
            <li>WebSocket: {connected ? 'conectado' : 'desconectado'}</li>
            <li>
              {board.lists.length} listas, {cardCount} cards
            </li>
          </ul>
          <div className="dialog-buttons">
            <button onClick={() => setAboutOpen(false)}>OK</button>
          </div>
        </Modal>
      )}

      <div className="taskbar">
        <button
          className="start"
          onClick={(e) => {
            e.stopPropagation()
            setStartOpen((open) => !open)
          }}
        >
          Iniciar
        </button>

        {startOpen && (
          <div className="window start-menu" onClick={(e) => e.stopPropagation()}>
            <ul className="start-items">
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    void run(() => api.createList('Nova lista'))
                  }}
                >
                  Nova lista
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    void reload()
                  }}
                >
                  Atualizar board
                </button>
              </li>
              <li className="start-separator" />
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    setAboutOpen(true)
                  }}
                >
                  Sobre...
                </button>
              </li>
            </ul>
          </div>
        )}

        <span className="taskbar-item">TeamApp 95</span>
        <span className="tray">
          {board.lists.length} listas · {cardCount} cards
        </span>
      </div>
    </div>
  )
}
