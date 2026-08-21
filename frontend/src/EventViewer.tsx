import { useCallback, useEffect, useState } from 'react'
import { API_URL } from './api'
import { Modal } from './Modal'
import { DocumentIcon, FolderIcon, TrashFullIcon, WarningIcon } from './icons'

type Activity = { id: string; type: string; summary: string; createdAt: string }

/** Um icone por familia de evento -- o Visualizador de Eventos do Windows faz igual. */
function iconFor(type: string) {
  if (type.startsWith('list.')) return <FolderIcon size={16} />
  if (type.includes('purged') || type.includes('emptied')) return <WarningIcon size={16} />
  if (type.includes('deleted')) return <TrashFullIcon size={16} />
  return <DocumentIcon size={16} />
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function EventViewer({
  onClose,
  onConfirm,
}: {
  onClose: () => void
  onConfirm: (c: { title: string; message: string; onYes: () => void }) => void
}) {
  const [items, setItems] = useState<Activity[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/activity?limit=100`)
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      const data = (await res.json()) as { items: Activity[] }
      setItems(data.items)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // O backend faz broadcast de `activity.recorded`, mas o board nao guarda o log
  // (o payload nao pertence ao estado do board). Um listener proprio, so
  // enquanto a janela esta aberta, mantem a lista viva sem poluir o reducer.
  useEffect(() => {
    const socket = new WebSocket(API_URL.replace(/^http/, 'ws') + '/ws')
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as { type: string; payload: Activity }
      if (event.type === 'activity.recorded') {
        setItems((current) => (current ? [event.payload, ...current].slice(0, 100) : current))
      }
    }
    return () => socket.close()
  }, [])

  const clear = async () => {
    try {
      const res = await fetch(`${API_URL}/api/activity`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal title="Visualizador de Eventos" onClose={onClose} width={520}>
      {error && <p className="trash-error">{error}</p>}

      <div className="event-list">
        {items === null && <p className="trash-empty">Lendo o log...</p>}
        {items?.length === 0 && <p className="trash-empty">Nenhum evento registrado.</p>}
        {items && items.length > 0 && (
          <table>
            <thead>
              <tr>
                <th aria-label="Tipo" />
                <th>Data e hora</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="event-icon">{iconFor(item.type)}</td>
                  <td className="event-time">{formatTime(item.createdAt)}</td>
                  <td>{item.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="trash-footer">
        <span className="trash-status">{items ? `${items.length} evento(s)` : ''}</span>
        <button onClick={() => void load()}>Atualizar</button>
        <button
          disabled={!items || items.length === 0}
          onClick={() =>
            onConfirm({
              title: 'Limpar log',
              message: 'Apagar todo o log de eventos? Isso não volta.',
              onYes: () => void clear(),
            })
          }
        >
          Limpar log
        </button>
        <button onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  )
}
