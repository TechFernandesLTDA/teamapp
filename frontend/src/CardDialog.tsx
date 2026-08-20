import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import type { Card } from './types'

type Props = {
  card: Card
  onSave: (patch: { title: string; description: string }) => void
  onDelete: () => void
  onClose: () => void
}

/**
 * Propriedades do card. PATCH /api/cards/:id aceita title e description -- mover e
 * outro endpoint, entao este dialogo nunca toca em position nem em listId.
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
    if (trimmed !== card.title || description !== card.description) {
      onSave({ title: trimmed, description })
    }
    onClose()
  }

  return (
    <Modal title="Propriedades do card" onClose={onClose}>
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
        />
      </div>

      <div className="dialog-buttons">
        <button className="danger" onClick={onDelete}>
          Excluir
        </button>
        <button onClick={save} disabled={!title.trim()}>
          OK
        </button>
        <button onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  )
}
