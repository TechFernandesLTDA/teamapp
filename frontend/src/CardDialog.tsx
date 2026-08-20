import { useEffect, useState } from 'react'
import type { Card } from './types'

type Props = {
  card: Card
  onSave: (patch: { title: string; description: string }) => void
  onDelete: () => void
  onClose: () => void
}

/**
 * Janela de edicao do card. PATCH /api/cards/:id aceita title e description --
 * mover e outro endpoint, entao este dialogo nunca mexe em position/listId.
 */
export function CardDialog({ card, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)

  // Se o eco do WebSocket trouxer uma edicao feita em outra aba, segue o servidor.
  useEffect(() => {
    setTitle(card.title)
    setDescription(card.description)
  }, [card.title, card.description])

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    onSave({ title: trimmed, description })
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="window dialog"
        role="dialog"
        aria-label="Editar card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="title-bar">
          <div className="title-bar-text">Propriedades do card</div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={onClose} />
          </div>
        </div>

        <div className="window-body">
          <div className="field-row-stacked">
            <label htmlFor="card-title">Titulo</label>
            <input
              id="card-title"
              type="text"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') onClose()
              }}
            />
          </div>

          <div className="field-row-stacked">
            <label htmlFor="card-description">Descricao</label>
            <textarea
              id="card-description"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose()
              }}
            />
          </div>

          <div className="dialog-buttons">
            <button onClick={save} disabled={!title.trim()}>
              OK
            </button>
            <button onClick={onClose}>Cancelar</button>
            <button
              className="danger"
              onClick={() => {
                if (window.confirm(`Apagar o card "${card.title}"?`)) {
                  onDelete()
                  onClose()
                }
              }}
            >
              Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
