import { useCallback, useSyncExternalStore } from 'react'

export type SoundName = 'ding' | 'chord' | 'error' | 'startup' | 'recycle'

const STORAGE_KEY = 'teamapp95.sounds'

/* ------------------------------------------------------------------ *
 * Preferencia (liga/desliga)
 * ------------------------------------------------------------------ */

/**
 * O estado vive fora do React porque varios componentes podem chamar
 * `useSounds()` -- o botao da taskbar, o board, um dialogo. Se cada um tivesse
 * o seu proprio `useState`, desligar o som num lugar deixaria os outros ainda
 * tocando. Uma store minima + `useSyncExternalStore` mantem todos em sincronia.
 */
let enabledState = readStored()
const listeners = new Set<() => void>()

/** localStorage e inacessivel em modo privado/iframe restrito: nunca deixe estourar. */
function readStored(): boolean {
  try {
    // Comeca DESLIGADO: som automatico que o usuario nao pediu e hostil.
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

function writeStored(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off')
  } catch {
    // Sem persistencia a preferencia vale so para esta aba. Aceitavel.
  }
}

function setEnabled(value: boolean): void {
  if (enabledState === value) return
  enabledState = value
  writeStored(value)
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): boolean {
  return enabledState
}

/* ------------------------------------------------------------------ *
 * AudioContext preguicoso
 * ------------------------------------------------------------------ */

interface WebkitWindow {
  webkitAudioContext?: typeof AudioContext
}

let ctx: AudioContext | null = null

/**
 * Por que preguicoso: navegadores modernos exigem um "gesto do usuario" antes
 * de deixar audio soar. Um `new AudioContext()` criado na importacao do modulo
 * nasce `suspended` e, pior, alguns navegadores logam aviso e o contexto fica
 * inutil ate um `resume()` dentro de um handler de evento. Criando no primeiro
 * `play()` -- que so acontece a partir de um clique/tecla -- o contexto ja nasce
 * autorizado. E se ainda vier `suspended`, `resume()` roda no mesmo tick do
 * gesto, que e a unica janela em que o navegador aceita.
 *
 * Tambem ha um limite pratico de contextos por aba (~6 no Chrome), entao o
 * contexto e um singleton de modulo, nao um por componente.
 */
function getContext(): AudioContext | null {
  try {
    if (ctx === null) {
      const Ctor =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : (window as unknown as WebkitWindow).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') {
      // `resume()` devolve promise; um reject aqui nao pode virar unhandled.
      void ctx.resume().catch(() => undefined)
    }
    return ctx
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Sintese
 * ------------------------------------------------------------------ */

interface ToneOptions {
  freq: number
  /** Offset em segundos a partir de "agora". */
  at: number
  dur: number
  peak?: number
  type?: OscillatorType
  /** Ataque em segundos -- 0.001 e percussivo, 0.05 e macio. */
  attack?: number
}

/**
 * Uma nota = oscilador + envelope de ganho. O envelope importa: sem ele o corte
 * abrupto da onda vira um "click" audivel (descontinuidade no sinal).
 */
function tone(audio: AudioContext, o: ToneOptions): void {
  const t0 = audio.currentTime + o.at
  const peak = o.peak ?? 0.18
  const attack = o.attack ?? 0.005

  const osc = audio.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, t0)

  const gain = audio.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  // Decaimento exponencial ate quase-zero: `exponentialRamp` nao aceita 0.
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)

  osc.connect(gain).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + o.dur + 0.02)
}

/** Ruido branco curto e filtrado -- o "papel amassando" da lixeira. */
function noise(audio: AudioContext, dur: number): void {
  const t0 = audio.currentTime
  const frames = Math.floor(audio.sampleRate * dur)
  const buffer = audio.createBuffer(1, frames, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    // Decai ao longo do buffer para o ruido nao terminar num corte seco.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  }

  const src = audio.createBufferSource()
  src.buffer = buffer

  // Passa-alta tira o "shhh" grave e deixa o chiado seco de papel.
  const filter = audio.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.setValueAtTime(1400, t0)
  filter.Q.setValueAtTime(0.7, t0)

  const gain = audio.createGain()
  gain.gain.setValueAtTime(0.22, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  src.connect(filter).connect(gain).connect(audio.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

function render(audio: AudioContext, name: SoundName): void {
  switch (name) {
    case 'ding':
      // Senoide curta em ~880Hz (A5) com decaimento rapido.
      tone(audio, { freq: 880, at: 0, dur: 0.18, peak: 0.2 })
      break

    case 'chord':
      // Arpejo ascendente (A4 - C#5 - E5): o "tada" de janela abrindo.
      tone(audio, { freq: 440, at: 0, dur: 0.3, type: 'triangle' })
      tone(audio, { freq: 554.37, at: 0.07, dur: 0.3, type: 'triangle' })
      tone(audio, { freq: 659.25, at: 0.14, dur: 0.4, type: 'triangle' })
      break

    case 'error':
      // Duas notas graves descendentes -- o gesto sonoro universal de "nao".
      tone(audio, { freq: 233.08, at: 0, dur: 0.22, type: 'square', peak: 0.1 })
      tone(audio, { freq: 174.61, at: 0.16, dur: 0.34, type: 'square', peak: 0.1 })
      break

    case 'startup':
      // 4 notas longas e sobrepostas, ataque macio: evoca o startup do Win95
      // sem reproduzir a melodia original (que e obra protegida).
      tone(audio, { freq: 293.66, at: 0, dur: 1.1, type: 'sine', peak: 0.14, attack: 0.08 })
      tone(audio, { freq: 440, at: 0.28, dur: 1.1, type: 'sine', peak: 0.13, attack: 0.08 })
      tone(audio, { freq: 587.33, at: 0.56, dur: 1.2, type: 'sine', peak: 0.12, attack: 0.08 })
      tone(audio, { freq: 880, at: 0.84, dur: 1.4, type: 'sine', peak: 0.1, attack: 0.1 })
      break

    case 'recycle':
      noise(audio, 0.32)
      break
  }
}

/* ------------------------------------------------------------------ *
 * Hook
 * ------------------------------------------------------------------ */

export interface Sounds {
  play: (name: SoundName) => void
  enabled: boolean
  toggle: () => void
}

/**
 * Sons do Windows 95 sintetizados na hora -- sem nenhum .wav no repositorio.
 * Binario em repo e peso morto e o container builda offline; a Web Audio API
 * ja tem tudo que esses cinco efeitos precisam.
 *
 * Regra de ouro: audio e enfeite. Nenhuma falha aqui pode derrubar a UI, por
 * isso todo caminho de execucao esta dentro de try/catch.
 */
export function useSounds(): Sounds {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const play = useCallback((name: SoundName) => {
    try {
      if (!enabledState) return
      const audio = getContext()
      if (!audio) return
      render(audio, name)
    } catch {
      // Contexto morto, aba sem saida de audio, politica de autoplay: ignore.
    }
  }, [])

  const toggle = useCallback(() => {
    const next = !enabledState
    setEnabled(next)
    // Ligar o som e um clique -- gesto valido para destravar o contexto. Toca
    // um feedback imediato para o usuario ouvir que funcionou.
    if (next) {
      try {
        const audio = getContext()
        if (audio) render(audio, 'ding')
      } catch {
        // idem
      }
    }
  }, [])

  return { play, enabled, toggle }
}
