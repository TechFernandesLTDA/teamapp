import { useEffect } from 'react'

type Handlers = Record<string, () => void>

/** Campos de texto engolem o atalho: digitar "n" num input nao pode criar lista. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Atalhos globais de teclado.
 *
 * A chave e a tecla em minusculo, opcionalmente com prefixo de modificador:
 * `'n'`, `'ctrl+f'`, `'?'`. O handler roda com `preventDefault()` ja aplicado.
 *
 * `enabled: false` desliga tudo -- e como um modal aberto evita que a tecla
 * dispare uma acao no board por tras dele.
 */
export function useHotkeys(handlers: Handlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const onKey = (e: KeyboardEvent) => {
      // Escape e o unico que funciona dentro de um campo -- e como se sai dele.
      if (isTyping(e.target) && e.key !== 'Escape') return

      const key = e.key.toLowerCase()
      const combo = e.ctrlKey || e.metaKey ? `ctrl+${key}` : key
      const handler = handlers[combo] ?? handlers[key]
      if (!handler) return

      e.preventDefault()
      handler()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `handlers` e recriado a cada render pelo chamador; depender do objeto
    // reinstalaria o listener toda vez. As teclas e o enabled bastam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, Object.keys(handlers).join(',')])
}
