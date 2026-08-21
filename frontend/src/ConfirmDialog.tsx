import { Modal } from './Modal'
import { WarningIcon } from './icons'

export type Confirmation = { title: string; message: string; onYes: () => void }

/** Substitui window.confirm: o nativo do browser quebra a estetica Win95. */
export function ConfirmDialog({
  confirmation,
  onClose,
}: {
  confirmation: Confirmation
  onClose: () => void
}) {
  return (
    <Modal title={confirmation.title} onClose={onClose} width={320}>
      <div className="confirm-body">
        <span className="confirm-icon">
          <WarningIcon size={32} />
        </span>
        <p>{confirmation.message}</p>
      </div>

      <div className="dialog-buttons">
        <button
          autoFocus
          onClick={() => {
            confirmation.onYes()
            onClose()
          }}
        >
          Sim
        </button>
        <button onClick={onClose}>Nao</button>
      </div>
    </Modal>
  )
}
