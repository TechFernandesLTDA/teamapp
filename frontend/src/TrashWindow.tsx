import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Modal } from './Modal'
import { DocumentIcon, FolderIcon } from './icons'
import type { Trash, TrashedCard, TrashedList } from './types'

type Props = {
  onClose: () => void
  /** Pede confirmacao antes de uma acao irreversivel. Reusa o ConfirmDialog do App. */
  onConfirm: (c: { title: string; message: string; onYes: () => void }) => void
  /** Contagem vinda do board/WS: muda quando alguem apaga algo em outra aba. */
  counts: { cards: number; lists: number }
}

/** "21/08/2026 01:47" -- sem segundos, que nao acrescentam nada aqui. */
function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TrashWindow({ onClose, onConfirm, counts }: Props) {
  const [trash, setTrash] = useState<Trash | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setTrash(await api.getTrash())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // A contagem chega por `trash.updated` no WebSocket, mas o conteudo nao --
  // o payload e so { cards, lists }. Quando ela muda, alguem mexeu na lixeira
  // (talvez em outra aba) e a lista aberta aqui esta velha: recarrega.
  const total = counts.cards + counts.lists
  useEffect(() => {
    void load()
  }, [total, load])

  /** Toda acao recarrega a lixeira; o board se atualiza sozinho pelo WebSocket. */
  const act = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await action()
      await load()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const empty = trash !== null && trash.cards.length === 0 && trash.lists.length === 0

  const cardRow = (card: TrashedCard) => {
    // O backend ja diz que o restore vai dar 409 -- da para desabilitar o botao
    // antes do clique em vez de mostrar o erro depois.
    const blocked = card.originalList.deleted
    return (
      <li key={card.id} className="trash-item">
        <span className="trash-icon">
          <DocumentIcon size={16} />
        </span>
        <div className="trash-info">
          <strong>{card.title}</strong>
          <small>
            card de "{card.originalList.title}" · {formatDate(card.deletedAt)}
          </small>
          {blocked && (
            <small className="trash-blocked">
              a lista de origem também está na lixeira — restaure a lista primeiro
            </small>
          )}
        </div>
        <div className="trash-actions">
          <button
            disabled={blocked || busy !== null}
            title={blocked ? 'Restaure a lista de origem primeiro' : 'Voltar para o board'}
            onClick={() => void act(card.id, () => api.restoreCard(card.id))}
          >
            Restaurar
          </button>
          <button
            disabled={busy !== null}
            onClick={() =>
              onConfirm({
                title: 'Excluir',
                message: `Excluir "${card.title}" permanentemente? Isso não volta.`,
                onYes: () => void act(card.id, () => api.purgeCard(card.id)),
              })
            }
          >
            Excluir
          </button>
        </div>
      </li>
    )
  }

  const listRow = (list: TrashedList) => (
    <li key={list.id} className="trash-item">
      <span className="trash-icon">
        <FolderIcon size={16} />
      </span>
      <div className="trash-info">
        <strong>{list.title}</strong>
        <small>
          lista com {list.cardCount} card(s) · {formatDate(list.deletedAt)}
        </small>
      </div>
      <div className="trash-actions">
        <button
          disabled={busy !== null}
          onClick={() => void act(list.id, () => api.restoreList(list.id))}
        >
          Restaurar
        </button>
        <button
          disabled={busy !== null}
          onClick={() =>
            onConfirm({
              title: 'Excluir',
              message: `Excluir a lista "${list.title}" e seus cards permanentemente? Isso não volta.`,
              onYes: () => void act(list.id, () => api.purgeList(list.id)),
            })
          }
        >
          Excluir
        </button>
      </div>
    </li>
  )

  return (
    <Modal title="Lixeira" onClose={onClose} width={460}>
      {error && <p className="trash-error">{error}</p>}

      <div className="trash-list" role="list">
        {trash === null && <p className="trash-empty">Abrindo...</p>}
        {empty && <p className="trash-empty">A Lixeira está vazia.</p>}
        {trash !== null && (
          <ul>
            {trash.lists.map(listRow)}
            {trash.cards.map(cardRow)}
          </ul>
        )}
      </div>

      <div className="trash-footer">
        <span className="trash-status">
          {trash ? `${trash.counts.lists} lista(s), ${trash.counts.cards} card(s)` : ''}
        </span>
        <button
          disabled={empty || trash === null || busy !== null}
          onClick={() =>
            onConfirm({
              title: 'Esvaziar Lixeira',
              message: `Excluir permanentemente ${trash?.counts.lists ?? 0} lista(s) e ${
                trash?.counts.cards ?? 0
              } card(s)? Isso não volta.`,
              onYes: () => void act('empty', () => api.emptyTrash()),
            })
          }
        >
          Esvaziar Lixeira
        </button>
        <button onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  )
}
