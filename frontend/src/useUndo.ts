import { useCallback, useRef, useState } from 'react'

export type UndoAction = {
  /** O que aparece na barra: "Card 'Comprar CD-R' movido". */
  label: string
  /** Desfaz. Pode falhar -- o item pode ter sido apagado por outra aba nesse meio tempo. */
  undo: () => Promise<unknown>
}

const TIMEOUT_MS = 8000

/**
 * Desfazer de uma acao so, com validade.
 *
 * A pilha de undo tem um problema especifico neste app: o estado e compartilhado
 * entre abas por WebSocket, entao um "desfazer" de tres passos atras pode estar
 * revertendo algo que outra pessoa ja mudou. Guardar uma acao so, valida por
 * poucos segundos, mantem a janela em que a reversao ainda faz sentido.
 *
 * Por isso tambem nao existe redo: refazer o que voce desfez, depois de outra
 * pessoa ter mexido, e pedir conflito.
 */
export function useUndo() {
  const [action, setAction] = useState<UndoAction | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const clear = useCallback(() => {
    clearTimeout(timer.current)
    setAction(null)
  }, [])

  const offer = useCallback((next: UndoAction) => {
    clearTimeout(timer.current)
    setAction(next)
    timer.current = setTimeout(() => setAction(null), TIMEOUT_MS)
  }, [])

  const run = useCallback(async () => {
    if (!action) return
    // Limpa antes de executar: se o undo falhar, oferecer "desfazer" de novo
    // sobre um estado que ja mudou e pior do que so sumir com o botao.
    clear()
    await action.undo()
  }, [action, clear])

  return { action, offer, run, clear }
}
