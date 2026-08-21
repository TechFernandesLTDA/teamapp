import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { BombIcon, FlagIcon } from './icons'
import './minesweeper.css'

/* Tabuleiro classico "iniciante": 9x9 com 10 minas. */
const SIZE = 9
const MINES = 10
const TOTAL = SIZE * SIZE

type CellState = 'hidden' | 'revealed' | 'flagged'

type Cell = {
  mine: boolean
  /** Quantidade de minas nas 8 celulas vizinhas. So vale depois do 1o clique. */
  adjacent: number
  state: CellState
}

/** 'ready' = minas ainda nao foram sorteadas; o cronometro so anda em 'playing'. */
type Status = 'ready' | 'playing' | 'won' | 'lost'

type Game = { cells: Cell[]; status: Status }

const FACES: Record<Status, string> = {
  ready: '\u{1F600}',
  playing: '\u{1F600}',
  won: '\u{1F60E}',
  lost: '\u{1F635}',
}

function freshGame(): Game {
  return {
    cells: Array.from({ length: TOTAL }, () => ({
      mine: false,
      adjacent: 0,
      state: 'hidden' as CellState,
    })),
    status: 'ready',
  }
}

/** Indices das ate 8 celulas vizinhas. O clamp por linha evita o wrap de borda:
    sem ele a celula da coluna 8 "vizinharia" a coluna 0 da linha seguinte. */
function neighbors(index: number): number[] {
  const row = Math.floor(index / SIZE)
  const col = index % SIZE
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const r = row + dr
      const c = col + dc
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue
      out.push(r * SIZE + c)
    }
  }
  return out
}

/** As minas so sao sorteadas depois do primeiro clique, e a celula clicada mais
    toda a sua vizinhanca ficam de fora do sorteio. Duas razoes: o primeiro clique
    nunca pode matar (seria um jogo perdido sem jogada), e zerando a vizinhanca
    garantimos `adjacent === 0` ali, o que dispara o flood fill e abre uma area
    inicial em vez de um unico quadradinho com um numero. */
function plantMines(cells: Cell[], safeIndex: number): Cell[] {
  const forbidden = new Set<number>([safeIndex, ...neighbors(safeIndex)])
  const pool: number[] = []
  for (let i = 0; i < TOTAL; i++) if (!forbidden.has(i)) pool.push(i)

  // Fisher-Yates parcial: embaralha so o suficiente para tirar MINES indices.
  for (let i = 0; i < MINES; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }

  const next = cells.map((cell) => ({ ...cell, mine: false, adjacent: 0 }))
  for (let i = 0; i < MINES; i++) next[pool[i]].mine = true
  for (let i = 0; i < TOTAL; i++) {
    if (next[i].mine) continue
    next[i].adjacent = neighbors(i).filter((n) => next[n].mine).length
  }
  return next
}

/** Flood fill iterativo a partir de `start`.
    A pilha explicita (em vez de recursao) evita estourar o stack, e marcar a
    celula como revelada ANTES de empilhar os vizinhos e o que impede o loop
    infinito: cada celula so entra na parte "expande" uma unica vez, porque na
    segunda visita ela ja esta em 'revealed' e o `continue` corta o caminho. */
function revealFrom(cells: Cell[], start: number): Cell[] {
  const next = cells.slice()
  const stack: number[] = [start]
  while (stack.length > 0) {
    const i = stack.pop() as number
    const cell = next[i]
    if (cell.state === 'revealed' || cell.state === 'flagged') continue
    next[i] = { ...cell, state: 'revealed' }
    // Celula com vizinho minado e parede: revela, mas nao propaga.
    if (!cell.mine && cell.adjacent === 0) {
      for (const n of neighbors(i)) stack.push(n)
    }
  }
  return next
}

/** Vitoria = toda celula sem mina revelada. Nao exige bandeira nas minas —
    e a regra do Campo Minado original. */
function hasWon(cells: Cell[]): boolean {
  return cells.every((c) => c.mine || c.state === 'revealed')
}

function display(value: number): string {
  const clamped = Math.max(-99, Math.min(999, value))
  const sign = clamped < 0 ? '-' : ''
  return sign + String(Math.abs(clamped)).padStart(sign ? 2 : 3, '0')
}

export function Minesweeper({ onClose }: { onClose: () => void }) {
  const [game, setGame] = useState<Game>(freshGame)
  const [seconds, setSeconds] = useState(0)

  const flags = useMemo(
    () => game.cells.filter((c) => c.state === 'flagged').length,
    [game.cells],
  )

  useEffect(() => {
    if (game.status !== 'playing') return
    const id = window.setInterval(() => setSeconds((s) => Math.min(999, s + 1)), 1000)
    return () => window.clearInterval(id)
  }, [game.status])

  const restart = useCallback(() => {
    setGame(freshGame())
    setSeconds(0)
  }, [])

  const handleReveal = useCallback((index: number) => {
    setGame((prev) => {
      if (prev.status === 'won' || prev.status === 'lost') return prev
      if (prev.cells[index].state !== 'hidden') return prev

      // O sorteio acontece aqui, dentro do updater, para que a celula clicada
      // esteja sempre disponivel como semente do "primeiro clique seguro".
      const cells = prev.status === 'ready' ? plantMines(prev.cells, index) : prev.cells

      if (cells[index].mine) {
        return {
          cells: cells.map((c) => (c.mine ? { ...c, state: 'revealed' as CellState } : c)),
          status: 'lost',
        }
      }

      const opened = revealFrom(cells, index)
      return { cells: opened, status: hasWon(opened) ? 'won' : 'playing' }
    })
  }, [])

  const handleFlag = useCallback((index: number) => {
    setGame((prev) => {
      if (prev.status === 'won' || prev.status === 'lost') return prev
      const cell = prev.cells[index]
      if (cell.state === 'revealed') return prev
      const cells = prev.cells.slice()
      cells[index] = { ...cell, state: cell.state === 'flagged' ? 'hidden' : 'flagged' }
      // Bandeira antes do primeiro clique nao inicia o cronometro: sem minas
      // sorteadas ainda nao existe partida para cronometrar.
      return { cells, status: prev.status }
    })
  }, [])

  return (
    <Modal title="Campo Minado" onClose={onClose} width={300}>
      <div className="ms-frame">
        <div className="ms-hud">
          <span className="ms-display" aria-label={`Minas restantes: ${MINES - flags}`}>
            {display(MINES - flags)}
          </span>
          <button
            type="button"
            className="ms-face"
            onClick={restart}
            aria-label="Reiniciar jogo"
          >
            <span aria-hidden="true">{FACES[game.status]}</span>
          </button>
          <span className="ms-display" aria-label={`Tempo: ${seconds} segundos`}>
            {display(seconds)}
          </span>
        </div>

        <div className="ms-board" role="grid" aria-label="Tabuleiro 9 por 9 com 10 minas">
          {game.cells.map((cell, i) => {
            const row = Math.floor(i / SIZE) + 1
            const col = (i % SIZE) + 1
            const revealed = cell.state === 'revealed'
            const isMine = revealed && cell.mine
            const number = revealed && !cell.mine && cell.adjacent > 0 ? cell.adjacent : 0

            const label =
              cell.state === 'flagged'
                ? `Linha ${row}, coluna ${col}: marcada com bandeira`
                : !revealed
                  ? `Linha ${row}, coluna ${col}: fechada`
                  : isMine
                    ? `Linha ${row}, coluna ${col}: mina`
                    : number > 0
                      ? `Linha ${row}, coluna ${col}: ${number} minas por perto`
                      : `Linha ${row}, coluna ${col}: vazia`

            return (
              <button
                key={i}
                type="button"
                className={
                  'ms-cell' +
                  (revealed ? ' ms-revealed' : '') +
                  (isMine ? ' ms-mine' : '') +
                  (number > 0 ? ` ms-n${number}` : '')
                }
                aria-label={label}
                onClick={() => handleReveal(i)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  handleFlag(i)
                }}
              >
                <span aria-hidden="true" className="ms-glyph">
                  {cell.state === 'flagged' ? (
                    <FlagIcon size={14} />
                  ) : isMine ? (
                    <BombIcon size={14} />
                  ) : number > 0 ? (
                    number
                  ) : (
                    ''
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <p className="ms-hint" role="status">
          {game.status === 'won'
            ? 'Voce venceu! Campo limpo.'
            : game.status === 'lost'
              ? 'Boom. Clique na carinha para jogar de novo.'
              : 'Clique para abrir, botao direito para marcar bandeira.'}
        </p>
      </div>
    </Modal>
  )
}
