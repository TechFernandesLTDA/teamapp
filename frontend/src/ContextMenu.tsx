import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuItem =
  | { kind: 'item'; label: string; onClick: () => void; disabled?: boolean; bold?: boolean }
  | { kind: 'separator' }

export type MenuState = { x: number; y: number; items: MenuItem[] }

/**
 * Menu de contexto do Windows 95: botao direito em qualquer lugar.
 *
 * O detalhe que faz parecer nativo e o reposicionamento -- um menu aberto perto
 * da borda direita da tela abre para a ESQUERDA do cursor, nao para fora da
 * viewport. Precisa medir depois de montar, por isso o useLayoutEffect: com
 * useEffect normal o menu pisca na posicao errada antes de corrigir.
 */
export function ContextMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: state.x, y: state.y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const margin = 4
    setPos({
      x: state.x + box.width > window.innerWidth ? Math.max(margin, state.x - box.width) : state.x,
      y:
        state.y + box.height > window.innerHeight
          ? Math.max(margin, state.y - box.height)
          : state.y,
    })
  }, [state.x, state.y])

  useEffect(() => {
    // Qualquer clique, Escape ou scroll fecha -- e o comportamento do shell.
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="window context-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ul>
        {state.items.map((item, i) =>
          item.kind === 'separator' ? (
            <li key={i} className="context-separator" role="separator" />
          ) : (
            <li key={i}>
              <button
                role="menuitem"
                disabled={item.disabled}
                className={item.bold ? 'context-default' : undefined}
                onClick={() => {
                  item.onClick()
                  onClose()
                }}
              >
                {item.label}
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
