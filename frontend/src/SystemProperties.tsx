import { useState } from 'react'
import { Modal } from './Modal'
import { ComputerIcon } from './icons'
import './systemproperties.css'

/**
 * Numeros que a janela mostra. `boardTitle` e opcional de proposito: o "Registrado
 * para" do Win95 exibe o nome do dono, que aqui e o titulo do board -- mas quem so
 * tiver as contagens em maos ainda consegue montar o objeto.
 */
export type SystemStats = {
  lists: number
  cards: number
  trashed: number
  apiUrl: string
  connected: boolean
  boardTitle?: string
}

type Props = {
  stats: SystemStats
  onClose: () => void
}

type Tab = 'geral' | 'desempenho'

/** Limites ficticios: o Win95 tambem media recursos contra um teto arbitrario. */
const LIMITS = { cards: 100, lists: 20, trashed: 50 } as const

const clampPct = (used: number, total: number) =>
  Math.max(0, Math.min(100, Math.round((used / total) * 100)))

export function SystemProperties({ stats, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('geral')

  const cardsPct = clampPct(stats.cards, LIMITS.cards)
  const listsPct = clampPct(stats.lists, LIMITS.lists)
  const trashPct = clampPct(stats.trashed, LIMITS.trashed)
  /** "Recursos do sistema: N% livres" -- a media do que as tres barras consomem. */
  const freePct = 100 - Math.round((cardsPct + listsPct + trashPct) / 3)

  return (
    <Modal title="Propriedades do Sistema" onClose={onClose} width={400}>
      <div className="sp-root">
        {/* Estrutura de abas do 98.css: menu[role=tablist] + .window[role=tabpanel].
            A margem negativa do menu e o que "cola" a aba ativa no painel. */}
        <menu role="tablist" className="sp-tabs">
          <li role="tab" aria-selected={tab === 'geral'}>
            <a
              href="#sp-geral"
              onClick={(e) => {
                e.preventDefault()
                setTab('geral')
              }}
            >
              Geral
            </a>
          </li>
          <li role="tab" aria-selected={tab === 'desempenho'}>
            <a
              href="#sp-desempenho"
              onClick={(e) => {
                e.preventDefault()
                setTab('desempenho')
              }}
            >
              Desempenho
            </a>
          </li>
        </menu>

        <div className="window sp-panel" role="tabpanel">
          <div className="window-body">
            {tab === 'geral' ? <GeneralTab stats={stats} /> : null}
            {tab === 'desempenho' ? (
              <PerformanceTab
                freePct={freePct}
                bars={[
                  { label: 'Cards', used: stats.cards, total: LIMITS.cards, pct: cardsPct },
                  { label: 'Listas', used: stats.lists, total: LIMITS.lists, pct: listsPct },
                  { label: 'Lixeira', used: stats.trashed, total: LIMITS.trashed, pct: trashPct },
                ]}
              />
            ) : null}
          </div>
        </div>

        {/* OK e Cancelar fecham; Aplicar fica cinza porque nao ha nada editavel --
            e exatamente como o Win95 se comportava antes de qualquer mudanca. */}
        <div className="dialog-buttons">
          <button className="default" onClick={onClose}>
            OK
          </button>
          <button onClick={onClose}>Cancelar</button>
          <button disabled>Aplicar</button>
        </div>
      </div>
    </Modal>
  )
}

function GeneralTab({ stats }: { stats: SystemStats }) {
  return (
    <div className="sp-general">
      <ComputerIcon size={48} />
      <div className="sp-general-text">
        <p className="sp-heading">Sistema:</p>
        <p>TeamApp 95</p>
        <p>Versao 4.00.950 B</p>
        <p className="sp-heading">Registrado para:</p>
        <p>{stats.boardTitle ?? 'Quadro sem titulo'}</p>
        <p>TeamApp Inc.</p>
        <p className="sp-heading">Computador:</p>
        <p>Servidor de API</p>
        <p className="sp-mono">{stats.apiUrl}</p>
        <p>
          WebSocket: {stats.connected ? 'conectado' : 'desconectado'}
          {/* O quadradinho de cor e o unico sinal nao textual: verde/vermelho, VGA. */}
          <span className={stats.connected ? 'sp-led sp-led-on' : 'sp-led sp-led-off'} />
        </p>
      </div>
    </div>
  )
}

type Bar = { label: string; used: number; total: number; pct: number }

function PerformanceTab({ freePct, bars }: { freePct: number; bars: Bar[] }) {
  return (
    <div className="sp-perf">
      <p>
        Recursos do sistema: <strong>{freePct}% livres</strong>
      </p>
      <p>Sistema de arquivos: SQLite de 32 bits</p>
      <p>Memoria virtual: gerenciada pelo Prisma</p>

      <fieldset>
        <legend>Uso de recursos</legend>
        {bars.map((bar) => (
          <div className="sp-bar-row" key={bar.label}>
            <div className="sp-bar-label">
              <span>{bar.label}</span>
              <span>
                {bar.used} de {bar.total}
              </span>
            </div>
            {/* `segmented` e a variante do 98.css que desenha a barra em blocos --
                a barra do Win95 nunca foi continua, e esse detalhe entrega tudo.
                A largura inline vence o `width:100%` da folha de estilo. */}
            <div
              className="progress-indicator segmented sp-bar"
              role="progressbar"
              aria-label={bar.label}
              aria-valuenow={bar.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className="progress-indicator-bar" style={{ width: `${bar.pct}%` }} />
            </div>
          </div>
        ))}
      </fieldset>

      <p className="sp-note">
        O estado de desempenho do sistema esta {freePct >= 50 ? 'otimo' : 'sob carga'}.
      </p>
    </div>
  )
}
