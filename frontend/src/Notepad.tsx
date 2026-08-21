import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { WarningIcon } from './icons'
import './notepad.css'

type Props = {
  initialText: string
  title: string
  onSave: (text: string) => void
  onClose: () => void
}

/** Qual menu esta aberto. `null` = nenhum; so um por vez, como no original. */
type OpenMenu = 'arquivo' | 'editar' | 'formatar' | null

/**
 * Formato do carimbo do F5. O Notepad do Windows 95 usava a ordem do locale
 * (hora antes da data), e nao um ISO -- manter isso e metade da ilusao.
 */
function stamp(): string {
  const now = new Date()
  const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const data = now.toLocaleDateString('pt-BR')
  return `${hora} ${data}`
}

/**
 * Linha e coluna a partir do offset do caret. O textarea so expoe `selectionStart`
 * em caracteres, entao a conversao e nossa: linha = quantidade de \n antes, e a
 * coluna e a distancia ate o \n anterior. Com quebra automatica ligada o Notepad
 * original tambem contava linhas *logicas*, nao visuais -- e o que fazemos aqui.
 */
function lineCol(text: string, caret: number): { line: number; col: number } {
  const before = text.slice(0, caret)
  const lastBreak = before.lastIndexOf('\n')
  return { line: before.split('\n').length, col: caret - lastBreak }
}

export function Notepad({ initialText, title, onSave, onClose }: Props) {
  const [text, setText] = useState(initialText)
  /** Ultimo conteudo gravado. `dirty` e a comparacao com ele, nao um booleano solto:
      desfazer ate voltar ao original deixa de ser "alteracao nao salva", como no Win95. */
  const [saved, setSaved] = useState(initialText)
  const [wrap, setWrap] = useState(true)
  const [menu, setMenu] = useState<OpenMenu>(null)
  /** Segundo estado da janela: o aviso de saida. Nada de window.confirm. */
  const [asking, setAsking] = useState(false)
  const [caret, setCaret] = useState(0)
  /** Posicao para onde o caret deve ir depois que o React re-renderizar o texto. */
  const [pendingCaret, setPendingCaret] = useState<number | null>(null)

  const areaRef = useRef<HTMLTextAreaElement>(null)
  const dirty = text !== saved

  // Reposicionar o caret so funciona depois que o novo valor chegou ao DOM;
  // fazer isso dentro do handler colocaria o cursor no fim do texto.
  useEffect(() => {
    if (pendingCaret === null) return
    const el = areaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(pendingCaret, pendingCaret)
      setCaret(pendingCaret)
    }
    setPendingCaret(null)
  }, [pendingCaret])

  const syncCaret = () => {
    const el = areaRef.current
    if (el) setCaret(el.selectionStart)
  }

  const doSave = () => {
    onSave(text)
    setSaved(text)
    setMenu(null)
  }

  const insertStamp = () => {
    const el = areaRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const s = stamp()
    setText(text.slice(0, start) + s + text.slice(end))
    setPendingCaret(start + s.length)
    setMenu(null)
  }

  const selectAll = () => {
    setMenu(null)
    const el = areaRef.current
    if (!el) return
    el.focus()
    el.select()
    setCaret(el.selectionStart)
  }

  /** Porta unica de saida: backdrop, Esc, X e "Sair" passam todos por aqui. */
  const requestClose = () => {
    if (dirty && !asking) {
      setMenu(null)
      setAsking(true)
      return
    }
    onClose()
  }

  const { line, col } = lineCol(text, Math.min(caret, text.length))

  return (
    <Modal title={`${title} - Bloco de Notas`} onClose={requestClose} width={460}>
      {/* Fechar o menu ao clicar em qualquer lugar da janela imita o comportamento
          modal das barras de menu do Win95, sem listener global no document. */}
      <div
        className="np-root"
        onClick={() => setMenu(null)}
        onKeyDown={(e) => {
          if (e.key === 'F5') {
            e.preventDefault()
            insertStamp()
          }
        }}
      >
        {asking ? (
          <div className="np-ask">
            <div className="np-ask-body">
              <WarningIcon size={32} />
              <p>As alteracoes nao foram salvas. Deseja salva-las?</p>
            </div>
            <div className="dialog-buttons">
              <button
                autoFocus
                onClick={() => {
                  onSave(text)
                  onClose()
                }}
              >
                Sim
              </button>
              <button onClick={onClose}>Nao</button>
              <button onClick={() => setAsking(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="np-menubar" onClick={(e) => e.stopPropagation()}>
              <MenuButton
                label="Arquivo"
                open={menu === 'arquivo'}
                onToggle={() => setMenu(menu === 'arquivo' ? null : 'arquivo')}
                onHover={() => menu !== null && setMenu('arquivo')}
              >
                <MenuItem label="Salvar" hint="Ctrl+S" onSelect={doSave} disabled={!dirty} />
                <div className="np-sep" />
                <MenuItem label="Sair" onSelect={requestClose} />
              </MenuButton>

              <MenuButton
                label="Editar"
                open={menu === 'editar'}
                onToggle={() => setMenu(menu === 'editar' ? null : 'editar')}
                onHover={() => menu !== null && setMenu('editar')}
              >
                <MenuItem label="Selecionar tudo" hint="Ctrl+T" onSelect={selectAll} />
                <MenuItem label="Data/hora" hint="F5" onSelect={insertStamp} />
              </MenuButton>

              <MenuButton
                label="Formatar"
                open={menu === 'formatar'}
                onToggle={() => setMenu(menu === 'formatar' ? null : 'formatar')}
                onHover={() => menu !== null && setMenu('formatar')}
              >
                <MenuItem
                  label="Quebra de linha automatica"
                  checked={wrap}
                  onSelect={() => {
                    setWrap(!wrap)
                    setMenu(null)
                  }}
                />
              </MenuButton>
            </div>

            <textarea
              ref={areaRef}
              className="np-area"
              value={text}
              // `wrap="off"` e o que gera a barra horizontal; a classe cuida do
              // white-space, porque so o atributo nao basta em todos os browsers.
              wrap={wrap ? 'soft' : 'off'}
              spellCheck={false}
              autoFocus
              onChange={(e) => {
                setText(e.target.value)
                setCaret(e.target.selectionStart)
              }}
              onSelect={syncCaret}
              onClick={syncCaret}
              onKeyUp={syncCaret}
              onKeyDown={(e) => {
                // Ctrl+S e Ctrl+T sao os atalhos que a barra anuncia; sem isso o
                // hint ao lado do item de menu seria mentira.
                if (e.ctrlKey && e.key.toLowerCase() === 's') {
                  e.preventDefault()
                  doSave()
                } else if (e.ctrlKey && e.key.toLowerCase() === 't') {
                  e.preventDefault()
                  selectAll()
                }
              }}
            />

            <div className="status-bar np-status">
              <span className="status-bar-field">
                Lin {line}, Col {col}
              </span>
              <span className="status-bar-field">{text.length} caracteres</span>
              <span className="status-bar-field">{dirty ? 'Modificado' : 'Salvo'}</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

type MenuButtonProps = {
  label: string
  open: boolean
  onToggle: () => void
  /** Passar o mouse so troca de menu se algum ja estiver aberto -- regra do Win95. */
  onHover: () => void
  children: React.ReactNode
}

function MenuButton({ label, open, onToggle, onHover, children }: MenuButtonProps) {
  return (
    <div className="np-menu">
      <button
        type="button"
        className={open ? 'np-menu-title np-open' : 'np-menu-title'}
        aria-expanded={open}
        onClick={onToggle}
        onMouseEnter={onHover}
      >
        {label}
      </button>
      {open && <div className="np-dropdown">{children}</div>}
    </div>
  )
}

type MenuItemProps = {
  label: string
  hint?: string
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
}

function MenuItem({ label, hint, checked, disabled, onSelect }: MenuItemProps) {
  return (
    <button type="button" className="np-item" disabled={disabled} onClick={onSelect}>
      {/* Coluna fixa da marca de selecao: sem ela os rotulos dancam ao ligar/desligar. */}
      <span className="np-check">{checked ? '✓' : ''}</span>
      <span className="np-label">{label}</span>
      <span className="np-hint">{hint ?? ''}</span>
    </button>
  )
}
