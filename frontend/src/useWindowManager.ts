import { useCallback, useMemo, useState } from 'react'

export interface ManagedWindow {
  id: string
  title: string
  minimized: boolean
  z: number
}

export interface WindowManager {
  /** Ordenado por ordem de abertura -- e essa a ordem dos botoes da taskbar. */
  windows: ManagedWindow[]
  open: (id: string, title: string) => void
  close: (id: string) => void
  focus: (id: string) => void
  minimize: (id: string) => void
  isOpen: (id: string) => boolean
  /** Id da janela visivel no topo, ou `null` se nao ha nenhuma. */
  topmost: string | null
}

interface State {
  items: ManagedWindow[]
  /** Proximo z a distribuir. Vive no estado, nao num ref: ver nota abaixo. */
  nextZ: number
}

const BASE_Z = 10

const INITIAL: State = { items: [], nextZ: BASE_Z }

/**
 * Gerencia janelas ao estilo Win95: quais estao abertas, qual tem o foco e a
 * ordem estavel que a taskbar usa.
 *
 * Duas ordens diferentes convivem aqui e confundi-las e o bug classico:
 *
 * - **Ordem do array** = ordem de abertura. E o que a taskbar mostra, e ela
 *   nao pode se reorganizar quando o usuario clica numa janela -- botoes que
 *   pulam de lugar ao serem clicados sao impossiveis de acertar com o mouse.
 * - **`z`** = ordem de empilhamento. Muda a cada foco.
 *
 * O contador `nextZ` fica no estado (nao num `useRef`) porque toda atualizacao
 * acontece dentro de um updater funcional, e updaters precisam ser puros: o
 * StrictMode do React 18 os invoca duas vezes em dev, e um `ref.current++` ali
 * dentro contaria dobrado.
 */
export function useWindowManager(): WindowManager {
  const [state, setState] = useState<State>(INITIAL)

  const open = useCallback((id: string, title: string) => {
    setState((s) => {
      const existing = s.items.find((w) => w.id === id)
      // Reabrir uma janela ja aberta = trazer para frente e desminimizar.
      // E o que o Win95 faz e evita duplicar entradas na taskbar.
      if (existing) {
        return {
          items: s.items.map((w) =>
            w.id === id ? { ...w, title, minimized: false, z: s.nextZ } : w,
          ),
          nextZ: s.nextZ + 1,
        }
      }
      return {
        items: [...s.items, { id, title, minimized: false, z: s.nextZ }],
        nextZ: s.nextZ + 1,
      }
    })
  }, [])

  const close = useCallback((id: string) => {
    setState((s) => {
      if (!s.items.some((w) => w.id === id)) return s
      return { ...s, items: s.items.filter((w) => w.id !== id) }
    })
  }, [])

  const focus = useCallback((id: string) => {
    setState((s) => {
      const target = s.items.find((w) => w.id === id)
      if (!target) return s
      // Ja esta no topo e visivel: nao gasta um z novo nem re-renderiza.
      if (!target.minimized && target.z === s.nextZ - 1) return s
      return {
        items: s.items.map((w) => (w.id === id ? { ...w, minimized: false, z: s.nextZ } : w)),
        nextZ: s.nextZ + 1,
      }
    })
  }, [])

  const minimize = useCallback((id: string) => {
    setState((s) => {
      const target = s.items.find((w) => w.id === id)
      if (!target || target.minimized) return s
      // Minimizar esconde mas NAO remove: a janela precisa continuar na lista
      // para a taskbar poder mostrar o botao que a restaura.
      return { ...s, items: s.items.map((w) => (w.id === id ? { ...w, minimized: true } : w)) }
    })
  }, [])

  const isOpen = useCallback(
    (id: string) => state.items.some((w) => w.id === id),
    [state.items],
  )

  const topmost = useMemo(() => {
    let best: ManagedWindow | null = null
    for (const w of state.items) {
      if (w.minimized) continue
      if (best === null || w.z > best.z) best = w
    }
    return best === null ? null : best.id
  }, [state.items])

  return { windows: state.items, open, close, focus, minimize, isOpen, topmost }
}
