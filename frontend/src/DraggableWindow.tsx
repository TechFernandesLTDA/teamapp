import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react'
import './draggablewindow.css'

export interface DraggableWindowProps {
  title: string
  onClose: () => void
  /** Chamado em qualquer clique na janela -- o dono usa para subir o z-index. */
  onFocus?: () => void
  z?: number
  children: ReactNode
  width?: number
  initialX?: number
  initialY?: number
  /** Se ausente, o botao de minimizar nao aparece (nao ha taskbar para receber). */
  onMinimize?: () => void
  /** Sem isso a janela nao tem foco visual: title-bar cinza em vez de azul. */
  active?: boolean
}

/** Quantos pixels da janela precisam continuar dentro da viewport. */
const KEEP_VISIBLE = 60
/** Altura aproximada da title-bar (3px de padding do `.window` + barra). */
const TITLE_BAR_H = 22

interface Point {
  x: number
  y: number
}

interface DragState {
  pointerId: number
  /** Distancia entre o ponto clicado e o canto da janela. */
  offsetX: number
  offsetY: number
}

/**
 * Janela arrastavel pela barra de titulo, como no Win95 de verdade.
 *
 * **Por que pointer events e nao o drag-and-drop HTML5**: os cards do board ja
 * usam `draggable` + `dragstart`/`drop`. Se a janela tambem fosse `draggable`,
 * arrastar um card de dentro dela dispararia os dois: o navegador escolhe o
 * ancestral arrastavel mais proximo, o `dataTransfer` acaba compartilhado e o
 * drop cai no alvo errado. Alem disso o HTML5 drag nao da coordenadas uteis
 * durante o arrasto (o `dragover` do documento e ruidoso e o `drag` reporta
 * 0,0 no Firefox). `pointerdown` + `setPointerCapture` resolve os dois
 * problemas: o movimento e continuo, as coordenadas sao exatas, e a captura
 * garante que o `pointermove` continue chegando mesmo se o cursor sair da
 * barra ou passar por cima de um iframe.
 */
export function DraggableWindow({
  title,
  onClose,
  onFocus,
  z = 1,
  children,
  width = 320,
  initialX = 80,
  initialY = 80,
  onMinimize,
  active = true,
}: DraggableWindowProps) {
  const [pos, setPos] = useState<Point>({ x: initialX, y: initialY })
  const [maximized, setMaximized] = useState(false)
  const drag = useRef<DragState | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  /** Impede que a janela suma: a title-bar precisa continuar alcancavel. */
  const clamp = useCallback(
    (p: Point): Point => {
      const maxX = window.innerWidth - KEEP_VISIBLE
      const minX = KEEP_VISIBLE - width
      const maxY = window.innerHeight - TITLE_BAR_H
      return {
        x: Math.min(Math.max(p.x, minX), maxX),
        // y nunca negativo: arrastar para cima esconderia a barra sob o topo
        // da viewport e nao haveria como pegar a janela de volta.
        y: Math.min(Math.max(p.y, 0), maxY),
      }
    },
    [width],
  )

  // Redimensionar a janela do navegador pode deixar a janelinha fora da tela.
  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    onFocus?.()
    if (maximized) return
    // Clique nos botoes de controle nao arrasta.
    if (e.target instanceof HTMLElement && e.target.closest('button')) return
    if (e.button !== 0) return

    drag.current = { pointerId: e.pointerId, offsetX: e.clientX - pos.x, offsetY: e.clientY - pos.y }
    barRef.current?.setPointerCapture(e.pointerId)
    // Sem isso o navegador comeca a selecionar o texto do titulo durante o arrasto.
    e.preventDefault()
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    setPos(clamp({ x: e.clientX - d.offsetX, y: e.clientY - d.offsetY }))
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    if (barRef.current?.hasPointerCapture(e.pointerId)) {
      barRef.current.releasePointerCapture(e.pointerId)
    }
  }

  const style = maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: z }
    : { left: pos.x, top: pos.y, width, zIndex: z }

  return (
    <div
      className={`window draggable-window${maximized ? ' is-maximized' : ''}`}
      style={style}
      onPointerDown={() => onFocus?.()}
      role="dialog"
      aria-label={title}
    >
      <div
        ref={barRef}
        className={`title-bar${active ? '' : ' inactive'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setMaximized((m) => !m)}
      >
        <div className="title-bar-text">{title}</div>
        <div className="title-bar-controls">
          {onMinimize ? (
            <button type="button" aria-label="Minimize" onClick={onMinimize} />
          ) : null}
          {/* 98.css estiliza Maximize e Restore por aria-label; trocar o label
              troca o icone sozinho, sem CSS proprio. */}
          <button
            type="button"
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onClick={() => setMaximized((m) => !m)}
          />
          <button type="button" aria-label="Close" onClick={onClose} />
        </div>
      </div>
      <div className="window-body draggable-window-body">{children}</div>
    </div>
  )
}
