import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api, API_URL, positionFor } from './api'
import { useBoard } from './useBoard'
import { CardDialog } from './CardDialog'
import { ConfirmDialog } from './ConfirmDialog'
import type { Confirmation } from './ConfirmDialog'
import { ListColumn } from './ListColumn'
import type { CardDropTarget } from './ListColumn'
import { Modal } from './Modal'
import { TrashWindow } from './TrashWindow'
import { Minesweeper } from './Minesweeper'
import { useHotkeys } from './useHotkeys'
import { ScreenSaver } from './ScreenSaver'
import { useUndo } from './useUndo'
import { ContextMenu } from './ContextMenu'
import type { MenuState } from './ContextMenu'
import { Notepad } from './Notepad'
import { SystemProperties } from './SystemProperties'
import { useSounds } from './useSounds'
import { TrashEmptyIcon, TrashFullIcon, WindowsFlagIcon } from './icons'
import type { List } from './types'

/** O que esta sendo arrastado. Card e lista compartilham a tela, nao o alvo. */
type Drag = { kind: 'card'; id: string } | { kind: 'list'; id: string } | null

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="window crash">
      <div className="title-bar">
        <div className="title-bar-text">TeamApp 95</div>
      </div>
      <div className="window-body">{children}</div>
    </div>
  )
}

export default function App() {
  const { board, error, connected, run, reload, setError } = useBoard()
  const [drag, setDrag] = useState<Drag>(null)
  const [cardDropTarget, setCardDropTarget] = useState<CardDropTarget | null>(null)
  const [listDropSlot, setListDropSlot] = useState<number | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [newList, setNewList] = useState('')
  const [startOpen, setStartOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [minesweeperOpen, setMinesweeperOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const searchRef = useRef<HTMLInputElement>(null)
  const newListRef = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const undo = useUndo()
  const [notepadOpen, setNotepadOpen] = useState(false)
  const [sysPropsOpen, setSysPropsOpen] = useState(false)
  const sounds = useSounds()

  // Relogio da bandeja. 10s em vez de 1s: o display so mostra hora e minuto,
  // entao segundo a segundo seria render descartado.
  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 10_000)
    return () => clearInterval(tick)
  }, [])

  // Busca por titulo e descricao. Devolve o conjunto de ids que casam em vez de
  // filtrar as listas: esconder os cards que nao casam quebraria o drag-and-drop
  // (as posicoes dos vizinhos mudariam) -- realcar preserva o board inteiro.
  //
  // Fica aqui em cima, junto dos outros hooks, e NAO depois do `if (!board)`:
  // hook depois de return condicional muda a quantidade de hooks entre renders
  // e o React derruba a arvore inteira (tela em branco).
  const query = search.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!query || !board) return null
    const ids = new Set<string>()
    for (const list of board.lists) {
      for (const card of list.cards) {
        if (
          card.title.toLowerCase().includes(query) ||
          card.description.toLowerCase().includes(query)
        ) {
          ids.add(card.id)
        }
      }
    }
    return ids
  }, [query, board])

  // Qualquer janela aberta desliga os atalhos: senao "n" digitado num dialogo
  // criaria uma lista no board por tras dele.
  const modalOpen =
    minesweeperOpen ||
    trashOpen ||
    aboutOpen ||
    helpOpen ||
    notepadOpen ||
    sysPropsOpen ||
    confirmation !== null
  useHotkeys(
    {
      n: () => newListRef.current?.focus(),
      '/': () => searchRef.current?.focus(),
      'ctrl+f': () => searchRef.current?.focus(),
      t: () => setTrashOpen(true),
      r: () => void reload(),
      '?': () => setHelpOpen(true),
      escape: () => setSearch(''),
      'ctrl+z': () => void undo.run(),
    },
    !modalOpen && openCardId === null,
  )

  // Um clique em qualquer lugar fecha o menu Iniciar, como no Windows 95.
  useEffect(() => {
    if (!startOpen) return
    const close = () => setStartOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [startOpen])

  if (error && !board) {
    return (
      <Frame>
        <p>Nao foi possivel falar com o servidor.</p>
        <p className="crash-detail">{error}</p>
        <button onClick={() => void reload()}>Tentar novamente</button>
      </Frame>
    )
  }

  if (!board) return <Frame>Carregando...</Frame>

  // Derivado do board, nao copiado: o eco do WebSocket atualiza o dialogo aberto.
  const openCard = board.lists.flatMap((l) => l.cards).find((c) => c.id === openCardId) ?? null

  // Envelope unico em volta do `run`: assim nenhuma chamada individual precisa
  // lembrar de tocar som, e o som de erro acompanha qualquer falha de API.
  const runWithSound = (action: () => Promise<unknown>, ok: 'ding' | 'recycle' = 'ding') =>
    void run(async () => {
      try {
        const result = await action()
        sounds.play(ok)
        return result
      } catch (e) {
        sounds.play('error')
        throw e
      }
    })

  const endDrag = () => {
    setDrag(null)
    setCardDropTarget(null)
    setListDropSlot(null)
  }

  const submitList = (e: FormEvent) => {
    e.preventDefault()
    const title = newList.trim()
    if (!title) return
    runWithSound(() => api.createList(title))
    setNewList('')
  }

  const dropCard = (list: List, index: number) => {
    if (drag?.kind !== 'card') return
    const cardId = drag.id
    // Origem capturada ANTES do move: depois dele o eco do WebSocket ja
    // reescreveu o card e nao ha mais de onde tirar o lugar antigo.
    const origin = board.lists
      .flatMap((l) => l.cards)
      .find((c) => c.id === cardId)
    // Tirar o proprio card antes de calcular evita que ele vire vizinho de si mesmo
    // -- sem isso, arrastar um slot para baixo cai de volta no lugar de origem.
    const neighbours = list.cards.filter((c) => c.id !== cardId)
    const slot = Math.min(index, neighbours.length)
    void run(() => api.moveCard(cardId, list.id, positionFor(neighbours, slot)))
    if (origin && (origin.listId !== list.id || origin.position !== positionFor(neighbours, slot))) {
      undo.offer({
        label: `Card "${origin.title}" movido`,
        undo: () => api.moveCard(cardId, origin.listId, origin.position),
      })
    }
    endDrag()
  }

  const dropList = (slot: number) => {
    if (drag?.kind !== 'list') return
    const listId = drag.id
    const neighbours = board.lists.filter((l) => l.id !== listId)
    // O slot veio do array completo; sem a lista arrastada tudo depois dela anda um.
    const from = board.lists.findIndex((l) => l.id === listId)
    const target = Math.min(slot > from ? slot - 1 : slot, neighbours.length)
    if (from !== -1 && (target === from || neighbours.length === 0)) return endDrag()
    void run(() => api.moveList(listId, positionFor(neighbours, target)))
    endDrag()
  }

  const cardCount = board.lists.reduce((n, l) => n + l.cards.length, 0)

  // `board.trash` vem do GET /api/board e e atualizado pelo evento trash.updated:
  // o icone troca de estado sem precisar abrir a janela.
  const trashCount = (board.trash?.cards ?? 0) + (board.trash?.lists ?? 0)
  const trashFull = trashCount > 0

  return (
    <div
      className="desktop"
      onContextMenu={(e) => {
        // So o fundo: um clique direito sobre um card ou lista tem menu proprio
        // (ou deve cair no menu nativo, se nao tiver).
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        setMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            { kind: 'item', label: 'Nova lista', bold: true, onClick: () => newListRef.current?.focus() },
            { kind: 'separator' },
            { kind: 'item', label: 'Atualizar', onClick: () => void reload() },
            { kind: 'item', label: 'Abrir a Lixeira', onClick: () => setTrashOpen(true) },
            { kind: 'separator' },
            { kind: 'item', label: 'Propriedades', onClick: () => setSysPropsOpen(true) },
          ],
        })
      }}
    >
      <div className="board-header">
        <h1>{board.title}</h1>
        <span className={connected ? 'status online' : 'status offline'}>
          {connected ? 'conectado' : 'reconectando...'}
        </span>
        <div className="search-box">
          <input
            ref={searchRef}
            type="text"
            value={search}
            placeholder="Buscar cards... (/)"
            aria-label="Buscar cards"
            onChange={(e) => setSearch(e.target.value)}
          />
          {query && (
            <span className="search-count">
              {matches?.size ?? 0} de {cardCount}
            </span>
          )}
          {query && (
            <button type="button" onClick={() => setSearch('')} title="Limpar busca (Esc)">
              X
            </button>
          )}
        </div>

        <form className="add-list" onSubmit={submitList}>
          <input
            ref={newListRef}
            type="text"
            value={newList}
            placeholder="Nova lista... (N)"
            onChange={(e) => setNewList(e.target.value)}
          />
          <button type="submit" disabled={!newList.trim()}>
            Criar
          </button>
        </form>
      </div>

      {error && (
        <div className="window error-bar">
          <div className="window-body">
            <span>{error}</span>
            <button onClick={() => setError(null)}>OK</button>
          </div>
        </div>
      )}

      <button
        className="desktop-icon"
        onDoubleClick={() => setTrashOpen(true)}
        title="Lixeira (duplo-clique para abrir)"
      >
        <span className="desktop-icon-glyph">
          {trashFull ? <TrashFullIcon size={32} /> : <TrashEmptyIcon size={32} />}
        </span>
        <span className="desktop-icon-label">
          Lixeira
          {trashFull && (
            <>
              <br />
              {trashCount} {trashCount === 1 ? 'item' : 'itens'}
            </>
          )}
        </span>
      </button>

      <div className="board" onDragEnd={endDrag}>
        {board.lists.map((list, index) => (
          <ListColumn
            key={list.id}
            list={list}
            index={index}
            isLast={index === board.lists.length - 1}
            draggingCardId={drag?.kind === 'card' ? drag.id : null}
            draggingListId={drag?.kind === 'list' ? drag.id : null}
            cardDropTarget={cardDropTarget}
            listDropSlot={listDropSlot}
            onCardDragStart={(id) => setDrag({ kind: 'card', id })}
            onListDragStart={(id) => setDrag({ kind: 'list', id })}
            matches={matches}
            onCardHover={setCardDropTarget}
            onListHover={setListDropSlot}
            onCardDrop={dropCard}
            onListDrop={dropList}
            onDragEnd={endDrag}
            onOpenCard={(card) => {
              // O seed cria um card "Jogar Campo Minado". Abrir o jogo em vez do
              // dialogo de propriedades fecha a piada -- qualquer card com esse
              // titulo funciona, nao ha id magico envolvido.
              if (/campo minado/i.test(card.title)) return setMinesweeperOpen(true)
              setOpenCardId(card.id)
            }}
            onAddCard={(listId, title) => runWithSound(() => api.createCard(listId, title))}
            onRename={(l, title) => void run(() => api.renameList(l.id, title))}
            onDelete={(l) =>
              setConfirmation({
                title: 'Apagar lista',
                message: `Mandar "${l.title}" e seus ${l.cards.length} card(s) para a Lixeira?`,
                onYes: () => runWithSound(() => api.deleteList(l.id), 'recycle'),
              })
            }
          />
        ))}

        {board.lists.length === 0 && (
          <p className="board-empty">Nenhuma lista ainda. Crie a primeira ali em cima.</p>
        )}
      </div>

      {openCard && (
        <CardDialog
          card={openCard}
          onSave={(patch) => void run(() => api.updateCard(openCard.id, patch))}
          onClose={() => setOpenCardId(null)}
          onDelete={() =>
            setConfirmation({
              title: 'Apagar card',
              message: `Mandar o card "${openCard.title}" para a Lixeira?`,
              onYes: () => {
                runWithSound(() => api.deleteCard(openCard.id), 'recycle')
                setOpenCardId(null)
              },
            })
          }
        />
      )}

      {minesweeperOpen && <Minesweeper onClose={() => setMinesweeperOpen(false)} />}

      {notepadOpen && (
        <Notepad
          initialText={`Anotacoes de ${board.title}\r\n\r\n`}
          title="Anotacoes"
          // O Bloco de Notas nao tem persistencia no servidor: nao ha recurso de
          // "nota" no contrato da API, e inventar um so para isso seria mudanca
          // de contrato por conta propria. Fica no localStorage.
          onSave={(text) => {
            try {
              localStorage.setItem('teamapp95.notepad', text)
            } catch {
              /* modo privado: perde a nota, nao quebra a app */
            }
            sounds.play('ding')
          }}
          onClose={() => setNotepadOpen(false)}
        />
      )}

      {sysPropsOpen && (
        <SystemProperties
          stats={{
            lists: board.lists.length,
            cards: cardCount,
            trashed: trashCount,
            apiUrl: API_URL,
            connected,
            boardTitle: board.title,
          }}
          onClose={() => setSysPropsOpen(false)}
        />
      )}

      {trashOpen && (
        <TrashWindow
          onClose={() => setTrashOpen(false)}
          onConfirm={setConfirmation}
          counts={board.trash ?? { cards: 0, lists: 0 }}
        />
      )}

      {helpOpen && (
        <Modal title="Atalhos de teclado" onClose={() => setHelpOpen(false)} width={300}>
          <ul className="shortcut-list">
            <li>
              <kbd>N</kbd> <span>Nova lista</span>
            </li>
            <li>
              <kbd>/</kbd> <span>Buscar cards</span>
            </li>
            <li>
              <kbd>T</kbd> <span>Abrir a Lixeira</span>
            </li>
            <li>
              <kbd>R</kbd> <span>Atualizar o board</span>
            </li>
            <li>
              <kbd>Esc</kbd> <span>Limpar a busca / fechar janela</span>
            </li>
            <li>
              <kbd>?</kbd> <span>Esta janela</span>
            </li>
          </ul>
          <p className="shortcut-note">
            Os atalhos ficam desligados enquanto uma janela está aberta ou você está digitando
            num campo.
          </p>
          <div className="dialog-buttons">
            <button onClick={() => setHelpOpen(false)}>OK</button>
          </div>
        </Modal>
      )}

      {confirmation && (
        <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
      )}

      {aboutOpen && (
        <Modal title="Sobre o TeamApp 95" onClose={() => setAboutOpen(false)} width={300}>
          <p>
            <strong>TeamApp 95</strong>
          </p>
          <p>Um quadro estilo Trello com cara de Windows 95.</p>
          <ul className="about-facts">
            <li>API: {API_URL}</li>
            <li>WebSocket: {connected ? 'conectado' : 'desconectado'}</li>
            <li>
              {board.lists.length} listas, {cardCount} cards
            </li>
          </ul>
          <div className="dialog-buttons">
            <button onClick={() => setAboutOpen(false)}>OK</button>
          </div>
        </Modal>
      )}

      {undo.action && (
        <div className="window undo-bar" role="status">
          <div className="window-body">
            <span>{undo.action.label}</span>
            <button onClick={() => void undo.run()}>Desfazer (Ctrl+Z)</button>
            <button onClick={undo.clear} aria-label="Dispensar">
              X
            </button>
          </div>
        </div>
      )}

      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}

      <ScreenSaver />

      <div className="taskbar">
        <button
          className="start"
          onClick={(e) => {
            e.stopPropagation()
            setStartOpen((open) => !open)
          }}
        >
          <WindowsFlagIcon size={16} />
          Iniciar
        </button>

        {startOpen && (
          <div className="window start-menu" onClick={(e) => e.stopPropagation()}>
            <ul className="start-items">
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    void run(() => api.createList('Nova lista'))
                  }}
                >
                  Nova lista
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    void reload()
                  }}
                >
                  Atualizar board
                </button>
              </li>
              <li className="start-separator" />
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    setMinesweeperOpen(true)
                    sounds.play('chord')
                  }}
                >
                  Campo Minado
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    setNotepadOpen(true)
                    sounds.play('chord')
                  }}
                >
                  Bloco de Notas
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    setTrashOpen(true)
                  }}
                >
                  Lixeira{trashFull ? ` (${trashCount})` : ''}
                </button>
              </li>
              <li className="start-separator" />
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    setHelpOpen(true)
                  }}
                >
                  Atalhos de teclado
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    setSysPropsOpen(true)
                  }}
                >
                  Propriedades do Sistema
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    sounds.toggle()
                  }}
                >
                  Som: {sounds.enabled ? 'ligado' : 'desligado'}
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setStartOpen(false)
                    setAboutOpen(true)
                  }}
                >
                  Sobre...
                </button>
              </li>
            </ul>
          </div>
        )}

        <span className="taskbar-item">TeamApp 95</span>
        <span className="tray">
          {board.lists.length} listas · {cardCount} cards
          {trashFull && (
            <>
              {' · '}
              <TrashFullIcon size={16} className="tray-icon" />
              {trashCount}
            </>
          )}
          <span className="tray-clock">
            {clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </span>
      </div>
    </div>
  )
}
