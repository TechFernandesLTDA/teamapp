import { useEffect, useRef, useState } from 'react'

const IDLE_MS = 120_000

/**
 * O protetor de tela "Tubos"/logotipo do Windows 95: aparece apos 2 minutos de
 * ociosidade e some ao primeiro sinal de vida.
 *
 * A parte que importa e o que conta como ociosidade. Um board com WebSocket
 * recebe eventos o tempo todo -- se o timer resetasse com atividade de rede, o
 * protetor nunca apareceria com duas abas abertas. So input humano conta.
 */
export function ScreenSaver() {
  const [idle, setIdle] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const arm = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setIdle(true), IDLE_MS)
    }

    const wake = () => {
      setIdle((on) => {
        if (on) return false
        return on
      })
      arm()
    }

    // `pointermove` cobre mouse, caneta e toque numa assinatura so.
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const
    for (const e of events) window.addEventListener(e, wake, { passive: true })
    arm()

    return () => {
      clearTimeout(timer.current)
      for (const e of events) window.removeEventListener(e, wake)
    }
  }, [])

  if (!idle) return null

  return (
    <div className="screensaver" role="presentation">
      <div className="screensaver-logo">
        <span className="ss-line ss-1">TeamApp</span>
        <span className="ss-line ss-2">95</span>
      </div>
      <p className="screensaver-hint">mova o mouse para voltar</p>
    </div>
  )
}
