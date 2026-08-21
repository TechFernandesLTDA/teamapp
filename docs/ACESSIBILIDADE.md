# Auditoria de acessibilidade — frontend

Auditoria manual do código de `frontend/src/`, feita lendo `App.tsx`, `ListColumn.tsx`,
`TrashWindow.tsx`, `Modal.tsx`, `CardDialog.tsx`, `ConfirmDialog.tsx`, `Minesweeper.tsx`,
`ScreenSaver.tsx`, `useHotkeys.ts`, `icons.tsx`, `styles.css` e `index.html`. Referência:
WCAG 2.2 nível AA.

Este documento é só o diagnóstico. As correções ficam com a sessão `frontend` — nada aqui
foi implementado.

**O veredito curto:** o app tem *muita* coisa boa de acessibilidade em lugares periféricos
(o Campo Minado é o componente mais acessível do repositório) e quase nada na função
principal. **Não existe nenhuma forma de mover um card usando o teclado.** Um card nem
sequer recebe foco. Isso não é um detalhe a polir — é o app inteiro sendo inutilizável para
quem não usa mouse.

## Resumo

| # | Achado | Severidade | Arquivo |
|---|---|---|---|
| B1 | Card não é focável; mover/abrir card só por mouse | Bloqueante | `ListColumn.tsx:161` |
| B2 | Reordenar e renomear lista só por mouse | Bloqueante | `ListColumn.tsx:94`, `:109` |
| B3 | Ícone da Lixeira é um `<button>` que só responde a duplo-clique | Bloqueante | `App.tsx:215` |
| B4 | Botão de apagar lista se anuncia como "Close" | Bloqueante | `ListColumn.tsx:117` |
| S1 | Modal não prende o foco nem devolve o foco ao fechar | Sério | `Modal.tsx:12` |
| S2 | Escape fecha os dois modais empilhados de uma vez | Sério | `Modal.tsx:13`, `App.tsx:337` |
| S3 | Estado de conexão muda sem `aria-live` | Sério | `App.tsx:168` |
| S4 | Barra de erro sem `role="alert"` | Sério | `App.tsx:206`, `TrashWindow.tsx:151` |
| S5 | `.card-dimmed` fica em **2,42:1** — reprova AA (mínimo 4,5:1) | Sério | `styles.css:551` |
| S6 | Campos de texto sem rótulo (só `placeholder`) | Sério | `App.tsx:194`, `ListColumn.tsx:220` |
| S7 | Botões repetidos e indistinguíveis na Lixeira | Sério | `TrashWindow.tsx:91` |
| S8 | Atalhos de uma letra sem como desligar (WCAG 2.1.4) | Sério | `useHotkeys.ts:21` |
| S9 | Ordem de tabulação não segue a ordem visual | Sério | `App.tsx:215` + `styles.css:385` |
| S10 | Busca não anuncia resultado nem marca o card que casou | Sério | `App.tsx:181`, `ListColumn.tsx:170` |
| M1 | Ícones decorativos são anunciados (título por padrão) | Menor | `icons.tsx:75,171,190,225` |
| M2 | Menu Iniciar sem `aria-expanded`/`haspopup`, sem Escape | Menor | `App.tsx:363` |
| M3 | Lista (`<section>`) sem nome acessível; sem landmarks nem headings | Menor | `ListColumn.tsx:80`, `App.tsx:165` |
| M4 | Badge de descrição invisível para leitor de tela | Menor | `ListColumn.tsx:196` |
| M5 | `role="list"` envolvendo um `<ul>` na Lixeira | Menor | `TrashWindow.tsx:153` |
| M6 | Vários textos pequenos abaixo de 4,5:1 | Menor | `styles.css:44,48,90,540,637` |
| M7 | Campo Minado: bandeira só por botão direito; `role="grid"` sem `row`/`gridcell` | Menor | `Minesweeper.tsx:195,226` |
| M8 | Indicador de foco fraco / suprimido no ícone de desktop | Menor | `styles.css:402` |
| M9 | Protetor de tela não esconde o conteúdo abaixo dele | Menor | `ScreenSaver.tsx:45` |

---

## Bloqueantes

### B1 — Não existe forma de mover ou abrir um card pelo teclado

`frontend/src/ListColumn.tsx:161-198`. O card é um `<article draggable>`. Os únicos
manipuladores são `onDragStart`, `onDragOver`, `onDrop` e `onDoubleClick`. Não há
`tabIndex`, não há `onKeyDown`, não há `role`.

Consequências concretas, todas verificáveis só pelo código:

- **O card nunca recebe foco.** `<article>` não é focável por padrão e nada aqui o torna
  focável. Tabular por um board de 4 listas com 10 cards cada toca exatamente 12 controles
  (o botão de fechar de cada lista, o input e o botão "+" de cada lista) e **zero** cards.
- **Abrir o card é impossível pelo teclado.** A única entrada é `onDoubleClick`
  (`ListColumn.tsx:192`), que também é o único caminho para o diálogo de propriedades
  (`App.tsx:253-259`) — logo editar título e descrição, e apagar um card, são funções
  inalcançáveis sem mouse.
- **Mover é impossível pelo teclado.** `draggable` + eventos HTML5 de drag são, na
  prática, exclusivos de ponteiro; nenhum navegador oferece uma sequência de teclas
  equivalente.

O `CLAUDE.md` descreve o drag-and-drop como *a* função do app ("Drag-and-drop é HTML5
nativo"). Com isso, **a função principal do app é inacessível por teclado** — e, por
tabela, para leitores de tela, controle por voz e switch access. Isso reprova WCAG 2.1.1
(Keyboard), 4.1.2 (Name, Role, Value) e, por causa do `onDoubleClick`, também 2.5.2
(Pointer Cancellation).

**Correção proposta — desenho de uma alternativa por teclado.** Não é preciso trocar a
biblioteca nem abandonar o HTML5 drag: os dois caminhos podem coexistir sobre a mesma
função `positionFor` que já existe em `frontend/src/api.ts:63`.

1. **Tornar o card focável com *roving tabindex*.** Cada lista mantém "o card ativo":
   ele fica com `tabIndex={0}`, os demais com `tabIndex={-1}`. O board inteiro consome um
   único ponto de tabulação, em vez de N cards, e as setas navegam dentro dele.
   O card ganha `role="option"` dentro de um `.list-body` com `role="listbox"`
   (`aria-label={list.title}`), que é o par de papéis que descreve "coleção ordenada de
   itens selecionáveis" sem inventar semântica nova.

2. **Teclas dentro do board** (documentar na janela "Atalhos de teclado", `App.tsx:305`):

   | Tecla | Ação |
   |---|---|
   | `↑` / `↓` | move o foco entre cards da lista |
   | `←` / `→` | move o foco para a lista vizinha |
   | `Enter` | abre as propriedades do card (o que hoje só o duplo-clique faz) |
   | `Espaço` | **pega** o card / **solta** o card |
   | `Delete` | manda o card para a Lixeira |
   | `F2` | renomeia a lista (o que hoje só o duplo-clique na title bar faz) |

3. **O modo "pegou".** Ao pressionar `Espaço`, o card entra em modo de movimento:
   `aria-pressed="true"` no card e a mesma classe visual `.card.dragging` que o drag já
   usa. Nesse modo `↑`/`↓` **não** movem o foco, movem o *slot de destino* — exatamente o
   mesmo estado que `cardDropTarget` (`App.tsx:35`) já guarda, com o mesmo indicador
   visual `.drop-here` (`styles.css:112`). `←`/`→` mudam a lista de destino.
   `Espaço`/`Enter` confirmam e chamam `dropCard(list, index)` (`App.tsx:134`) — a mesma
   função do drop de mouse, então a matemática de position fracionária não é duplicada.
   `Escape` cancela e devolve o card ao lugar.

4. **Anunciar cada passo.** Uma região `aria-live="assertive"` visualmente escondida
   recebe, a cada tecla no modo "pegou", algo como
   `"Comprar leite: posição 3 de 7 em A Fazer"`, e na confirmação
   `"Comprar leite movido para Feito, posição 1 de 4"`. Sem isso o modo é invisível para
   quem não vê o indicador.

5. **Manter o mouse como está.** `draggable` continua; o modo por teclado só adiciona um
   segundo caminho para a mesma chamada de API. Nenhuma mudança no backend.

### B2 — Reordenar e renomear lista também são só de mouse

`frontend/src/ListColumn.tsx:94-104` — a `.title-bar` é `draggable` e só tem
`onDragStart`/`onDragEnd`. `ListColumn.tsx:109-112` — renomear é `onDoubleClick` no
`.title-bar-text`, que é uma `<div>` sem `tabIndex` e sem `role`. Mesmo diagnóstico e
mesma classe de correção do B1: `F2` para renomear a lista focada, e `Ctrl+←`/`Ctrl+→`
(ou o modo "pegou" aplicado à lista) para reordenar, reaproveitando `dropList`
(`App.tsx:145`).

### B3 — O ícone da Lixeira é um botão que não funciona pelo teclado

`frontend/src/App.tsx:215-232`:

```jsx
<button className="desktop-icon" onDoubleClick={() => setTrashOpen(true)} title="Lixeira (duplo-clique para abrir)">
```

É um `<button>` de verdade: entra na ordem de tabulação, recebe foco, tem estilo de foco
próprio (`styles.css:402-406`) e se anuncia como botão. Mas o único manipulador é
`onDoubleClick`. Pressionar `Enter` ou `Espaço` num botão dispara `click`, **nunca**
`dblclick` — então o controle recebe foco, parece acionável e **não faz nada**. É pior do
que não ser focável: promete uma ação que não existe. O `title` ainda instrui
"duplo-clique para abrir", uma instrução impossível de seguir sem mouse.

Existe um caminho alternativo (o atalho `T`, `App.tsx:89`, e o menu Iniciar,
`App.tsx:408`), então a função não está perdida — mas o controle em si está quebrado, o
que é uma falha 2.1.1 de qualquer jeito.

**Correção:** adicionar `onClick={() => setTrashOpen(true)}` e manter o `onDoubleClick`
para a fidelidade Win95 (o React não dispara os dois de forma conflitante aqui; se
disparar, um guard por `detail === 2` resolve). Trocar o `title` por
`aria-label={`Lixeira, ${trashCount} ${trashCount === 1 ? 'item' : 'itens'}`}`.

### B4 — O botão que apaga a lista se anuncia como "Close"

`frontend/src/ListColumn.tsx:117`:

```jsx
<button aria-label="Close" title="Apagar lista" onClick={() => props.onDelete(list)} />
```

O `aria-label` vence o `title` na computação do nome acessível, então um leitor de tela
anuncia **"Close, botão"** para um controle que manda a lista e todos os seus cards para a
Lixeira (`App.tsx:262-268`). O texto verdadeiro, que está em `title`, nunca é lido. Além
disso o rótulo está em inglês numa interface em pt-BR declarada com `lang="pt-BR"`
(`index.html:2`), então o sintetizador vai pronunciá-lo em português.

Um usuário de leitor de tela pressionando o que ele acredita ser "fechar a janela" dispara
uma ação destrutiva. Existe confirmação (`App.tsx:263`), o que impede o dano imediato —
mas o diálogo então pergunta sobre uma ação que o usuário não pediu.

**Correção:** `aria-label={`Apagar a lista ${list.title}`}` e remover o `title`
redundante. O mesmo `aria-label="Close"` aparece em `Modal.tsx:33`, onde a ação *é*
fechar; ali basta traduzir para `"Fechar"`.

---

## Sérios

### S1 — O Modal não prende o foco, não move o foco para dentro e não devolve o foco ao fechar

`frontend/src/Modal.tsx:12-40`. Os três problemas de foco de um diálogo, todos presentes:

- **Não prende (focus trap).** O backdrop (`Modal.tsx:22`) é uma `<div>` comum; nada
  marca o resto da página como `inert` ou `aria-hidden`. Tabular a partir do último botão
  do diálogo leva o foco para os controles do board atrás dele — o usuário edita o
  formulário de nova lista sem saber que há um diálogo aberto. Reprova 2.4.3.
- **Não move o foco para dentro.** O `Modal` não foca nada ao montar. Dois consumidores
  compensam por conta própria: `CardDialog.tsx:43` (`autoFocus` no input de título) e
  `ConfirmDialog.tsx:25` (`autoFocus` no "Sim"). Os outros quatro não:
  `TrashWindow.tsx:150`, `Minesweeper.tsx:176`, "Atalhos de teclado" (`App.tsx:306`) e
  "Sobre" (`App.tsx:342`). Abrir a Lixeira com `T` deixa o foco no `<body>`: o usuário tem
  de tabular pelo cabeçalho inteiro, pelo ícone de desktop e pelo board para chegar ao
  diálogo — e como não há trap, ele nem percebe quando entrou nele.
- **Não devolve o foco.** O `Modal` nunca guarda `document.activeElement` na montagem nem
  o restaura na desmontagem. Fechar qualquer diálogo joga o foco para o `<body>` e a
  próxima tabulação recomeça do topo do documento. Reprova 2.4.3.

**Correção:** concentrar tudo no `Modal`, já que todos os diálogos passam por ele:
guardar `document.activeElement` num ref no `useEffect` de montagem e chamar `.focus()`
nele no cleanup; focar o primeiro elemento focável do diálogo (ou o próprio contêiner com
`tabIndex={-1}`) ao montar; interceptar `Tab`/`Shift+Tab` no contêiner e circular dentro
dele. Adicionar `aria-modal="true"` em `Modal.tsx:25` e trocar `aria-label={title}` por
`aria-labelledby` apontando para o `.title-bar-text` de `Modal.tsx:31`, para que o nome do
diálogo e o texto visível sejam a mesma coisa.

### S2 — Escape fecha os dois modais empilhados ao mesmo tempo

`frontend/src/Modal.tsx:13-19` registra o listener de `Escape` em `window`. Quando a
Lixeira (`App.tsx:297`) pede uma confirmação, o `ConfirmDialog` (`App.tsx:337`) é montado
como **irmão** dela, não como filho — então há dois `Modal` vivos e dois listeners em
`window`. Um único `Escape` chama `onClose` dos dois: o usuário cancela a confirmação e
perde a janela da Lixeira junto.

Não é destrutivo, mas é exatamente o tipo de comportamento que faz um usuário de teclado
desistir: a tecla de "voltar atrás" também desfaz o contexto. Reprova a expectativa de
2.1.1/3.2 sobre operação previsível.

**Correção:** o `Modal` mantém uma pilha de instâncias em um módulo (ou um contexto) e só
a instância no topo responde ao `Escape`. Alternativa mais simples: chamar
`event.stopPropagation()` num listener no contêiner do diálogo em vez de em `window`,
deixando o evento morrer no diálogo mais interno — mas isso exige que o diálogo tenha o
foco, o que hoje não é garantido (ver S1).

### S3 — O estado de conexão muda em silêncio

`frontend/src/App.tsx:168-170`:

```jsx
<span className={connected ? 'status online' : 'status offline'}>
  {connected ? 'conectado' : 'reconectando...'}
</span>
```

O texto troca sozinho quando o WebSocket cai (`useBoard.ts:151-156`), sem `role="status"`
nem `aria-live`. Um leitor de tela nunca é informado de que a conexão caiu — ou seja, de
que o board na tela pode estar desatualizado e que as mutações dos colegas não estão mais
chegando. Para um app cujo modelo inteiro é "o estado se mantém pelo WebSocket"
(`CLAUDE.md`), esse é o aviso mais importante da tela.

**Correção:** `role="status"` (que já implica `aria-live="polite"`) no `<span>`, com o
texto completo em vez de abreviado: `"Conectado ao servidor"` / `"Conexão perdida,
reconectando"`. Vale também `aria-live="polite"` na `.tray` (`App.tsx:444`) ou, melhor,
não — a contagem de cards muda a cada evento e viraria tagarelice.

### S4 — Erros aparecem sem `role="alert"`

`frontend/src/App.tsx:206-213` monta a barra de erro condicionalmente. `useBoard.ts:177`
preenche `error` em **toda** mutação que falha, e o `api.ts:21` monta a mensagem com o
detalhe do backend. Nada disso é anunciado: sem `role="alert"`/`aria-live="assertive"`,
o conteúdo inserido dinamicamente é ignorado pelo leitor de tela. O usuário aperta um
botão, a chamada falha (por exemplo, um `409` ao restaurar um card cuja lista está na
lixeira) e, pelo que ele percebe, nada aconteceu.

Agrava: a barra é inserida **entre** o cabeçalho e o board (`App.tsx:206`), então o botão
"OK" que a dispensa (`App.tsx:210`) aparece na ordem de tabulação muito antes de onde o
usuário estava. Mesmo problema em `TrashWindow.tsx:151` (`<p className="trash-error">`).

**Correção:** `role="alert"` no contêiner da barra em `App.tsx:207` e no `<p>` de
`TrashWindow.tsx:151`. Como o `role="alert"` só anuncia quando o *conteúdo* muda, e aqui o
nó inteiro é montado e desmontado, o mais seguro é manter o contêiner sempre montado com
`role="alert"` e alternar apenas o texto interno. Mover o foco para o botão "OK" quando um
erro surge é uma opção mais forte, mas rouba o foco — prefira o anúncio.

### S5 — `.card-dimmed` reprova AA: 2,42:1

`frontend/src/styles.css:551-553`:

```css
.card-dimmed { opacity: 0.35; }
```

`opacity` compõe o **grupo inteiro** (fundo do card + texto) contra o que está atrás.
Cálculo com os valores reais do app:

- texto: `#222` (padrão do `98.css` no `body`), sobre fundo de card `#fff` (`styles.css:97`)
- atrás do card: a `.window-body` da lista, `#c0c0c0` do `98.css`

Composição a `α = 0.35`:

| | fórmula | resultado |
|---|---|---|
| texto | `0.35 × 34 + 0.65 × 192` | `rgb(137,137,137)` |
| fundo | `0.35 × 255 + 0.65 × 192` | `rgb(214,214,214)` |

Luminâncias relativas: `L_texto = 0,2502`, `L_fundo = 0,6724`.

**Contraste = (0,6724 + 0,05) / (0,2502 + 0,05) = 2,41 : 1.**

O mínimo de WCAG AA (1.4.3) é **4,5:1** para texto normal e **3:1** para texto grande.
O texto do card é o tamanho padrão do `98.css` (11px), portanto texto normal — reprova por
larga margem, e reprova até o limite mais frouxo de texto grande.

Não é um caso de "só decorativo": o card esmaecido continua sendo conteúdo real e continua
sendo o alvo de um drop. O comentário do código deixa claro que isso é intencional
(`ListColumn.tsx:168-170`: "esconder os que não casam mudaria os vizinhos e quebraria o
cálculo de position") — a decisão de não filtrar está certa, o meio escolhido é que não
está.

**Opacidade necessária para atingir 4,5:1**, nesse mesmo par de cores:

| opacity | texto | fundo | contraste |
|---|---|---|---|
| 0,35 (atual) | 137 | 214 | **2,42:1** ✗ |
| 0,50 | 113 | 224 | 3,68:1 ✗ |
| 0,55 | 105 | 227 | 4,26:1 ✗ |
| 0,58 | 100 | 229 | 4,65:1 ✓ |
| 0,60 | 97 | 230 | 4,94:1 ✓ |

**Correção recomendada (melhor que ajustar a opacidade):** parar de usar `opacity` e
fazer a distinção com uma diferença que não degrade o texto — realçar apenas quem casa,
que é o que `.card-match` (`styles.css:545-549`) já faz muito bem (outline `#000080` +
fundo `#ffffcc`), e deixar os demais **intactos**. Se ainda assim for necessário rebaixar
os não-casantes visualmente, use `filter: saturate(0)` ou uma borda mais clara, nunca
`opacity` sobre o texto. Se a opacidade for mantida por gosto estético, `0.6` é o piso.

E, independentemente do contraste: a distinção casou/não-casou é hoje **exclusivamente
visual** (S10).

### S6 — Campos de texto sem rótulo

- `App.tsx:194-199` — o input de "Nova lista" tem `placeholder="Nova lista... (N)"` e
  nenhum `<label>`, `aria-label` ou `aria-labelledby`. `placeholder` não é um nome
  acessível confiável (varia entre navegador e AT) e some assim que o usuário digita, o
  que também é uma falha de 3.3.2.
- `ListColumn.tsx:220-225` — o input de "Novo card..." tem o mesmo problema, **por lista**.
  Num board de 4 listas o leitor de tela encontra quatro caixas de texto idênticas, sem
  nada que diga a qual lista cada uma pertence.
- `ListColumn.tsx:226-228` — o botão de submit desse formulário tem como conteúdo inteiro
  a string `+`, então o nome acessível é "mais". Quatro botões chamados "mais".
- `ListColumn.tsx:123-136` — o input de renomear também não tem rótulo (tem `autoFocus`,
  o que ajuda, mas o usuário não é avisado do que está editando).

Note que o campo de busca (`App.tsx:172-179`) **tem** `aria-label="Buscar cards"`. O padrão
existe no repositório; só não foi aplicado nos outros campos.

**Correção:** `aria-label="Nova lista"` em `App.tsx:194`;
`aria-label={`Novo card em ${list.title}`}` em `ListColumn.tsx:221` e
`aria-label={`Adicionar card em ${list.title}`}` no botão de `ListColumn.tsx:226`;
`aria-label={`Renomear a lista ${list.title}`}` em `ListColumn.tsx:124`.

### S7 — Os botões da Lixeira são indistinguíveis entre si

`frontend/src/TrashWindow.tsx:91-109` e `126-144`. Cada linha da lixeira tem dois botões
cujo texto é apenas "Restaurar" e "Excluir". Navegando por botões (tecla `B` no NVDA,
rotor no VoiceOver) o usuário ouve "Restaurar, Excluir, Restaurar, Excluir, ..." sem
nenhuma pista de qual item está em qual. Como o segundo é irreversível
(`docs/API.md`: "Apaga **de verdade**, irreversível"), isso é sério.

**Correção:** `aria-label={`Restaurar o card "${card.title}"`}` e
`aria-label={`Excluir permanentemente o card "${card.title}"`}` (e o par equivalente para
listas em `TrashWindow.tsx:127` e `133`). Vale também ligar o aviso de `.trash-blocked`
(`TrashWindow.tsx:84-88`) ao botão desabilitado por `aria-describedby`; hoje o texto está
adjacente no DOM, o que salva o caso, mas o `title` do botão (`TrashWindow.tsx:93`) nunca é
anunciado porque botões `disabled` saem da árvore de foco.

### S8 — Atalhos de uma única letra, sem como desligar

`frontend/src/useHotkeys.ts:21-44`, configurado em `App.tsx:84-95`: `n`, `t`, `r`, `/`,
`?`, sem modificador. WCAG 2.1.4 (Character Key Shortcuts, nível A) exige que atalhos de
caractere único possam ser **desligados**, **remapeados**, ou fiquem **restritos ao
componente com foco**. Nenhuma das três condições é atendida — `useHotkeys.ts:38` registra
em `window` e a única desativação é automática (modal aberto, `App.tsx:83`, ou foco num
campo, `useHotkeys.ts:27`).

Na prática isso quebra leitores de tela de duas formas: no modo de navegação do NVDA/JAWS
as letras são teclas de salto rápido (`t` = próxima tabela, `n` = pular links) e vão
disputar com o app; e usuários de reconhecimento de voz emitem letras isoladas o tempo
todo. `r` recarregando o board e `t` abrindo a Lixeira são efeitos colaterais surpresa.

**Correção:** exigir um modificador (`Ctrl`/`Alt`) para as letras — `ctrl+f` já existe
(`App.tsx:88`) e é o modelo certo — ou adicionar uma preferência "desligar atalhos" no
menu Iniciar, persistida em `localStorage`, e citá-la na janela de atalhos
(`App.tsx:305-335`). `/` e `?` são menos problemáticos porque não são teclas de salto,
mas se beneficiam da mesma preferência.

### S9 — A ordem de tabulação não segue a ordem visual

A ordem no DOM (`App.tsx:164-457`) é: cabeçalho → barra de erro → **ícone da Lixeira** →
board → modais → taskbar. Mas o ícone da Lixeira é `position: fixed; left: 12px;
bottom: 44px` (`styles.css:385-390`): ele aparece no **canto inferior esquerdo** da tela e
é o **terceiro** parada da tabulação. O foco pula do topo da tela para a base, e volta
para o meio. Reprova 2.4.3 (Focus Order).

O board em si (`App.tsx:234`) tem tabulação esparsa e ilógica pelo B1: dentro de cada
lista o foco vai do botão de apagar direto para o input de novo card, atravessando todos
os cards sem parar em nenhum.

Não há **skip link** e não há landmarks: `.desktop`, `.board-header` e `.board` são todas
`<div>`s (`App.tsx:165`, `:166`, `:234`). Não há `<main>`, `<header>` nem `<nav>`, então
não há como pular direto para o conteúdo. Único heading da página é o `<h1>` do título do
board (`App.tsx:167`).

**Correção:** mover o `<button className="desktop-icon">` para logo antes da `.taskbar`
no JSX (`App.tsx:362`), preservando o `position: fixed` — a posição visual não muda e a
ordem passa a bater. Trocar `.board-header` por `<header>`, `.board` por `<main>` e a
`.taskbar` por `<nav aria-label="Barra de tarefas">`, e dar `<h2>` ao título de cada lista
(ver M3).

### S10 — A busca não anuncia nada e o card que casou não é marcado semanticamente

Dois pontos, mesma causa:

- `App.tsx:180-184` — o contador `"{matches?.size} de {cardCount}"` aparece e se atualiza a
  cada tecla digitada, sem `aria-live`. Quem não vê a tela digita a busca e não recebe
  retorno nenhum sobre se algo casou.
- `ListColumn.tsx:170` — a distinção entre casou e não casou é feita só pelas classes
  `.card-match` / `.card-dimmed`, ou seja, só por outline, cor de fundo e opacidade. Nada
  na árvore de acessibilidade diz que aquele card é um resultado da busca. Como a busca
  **realça em vez de filtrar** (decisão certa, ver `ListColumn.tsx:168-169`), sem marcação
  semântica o recurso simplesmente não existe para o leitor de tela: os 40 cards continuam
  todos lá, iguais. Reprova 1.4.1 (Use of Color) e 1.3.1.

**Correção:** `role="status"` no `<span className="search-count">` (`App.tsx:181`), com o
texto por extenso (`"3 de 40 cards encontrados"`). E, no card, quando há busca ativa,
`aria-current={matches.has(card.id) ? 'true' : undefined}` mais um sufixo em texto
visualmente escondido (`"— resultado da busca"`) no `.card-title` — ou, se o card virar
`role="option"` conforme o B1, `aria-selected`.

---

## Menores

### M1 — Ícones decorativos são anunciados porque o `title` tem valor padrão

O wrapper `Svg` em `frontend/src/icons.tsx:41-63` está **certo**: com `title` ele emite
`role="img"` + `aria-label`; sem `title`, emite `aria-hidden` + `focusable="false"`. É
exatamente o comportamento desejado.

O problema é que quase todo ícone declara um `title` **padrão**, então o modo decorativo
nunca é o padrão de fato: `TrashEmptyIcon` (`icons.tsx:75`, `'Lixeira vazia'`),
`TrashFullIcon` (`:101`), `FolderIcon` (`:171`, `'Pasta'`), `DocumentIcon` (`:190`,
`'Documento'`), `HourglassIcon` (`:206`), `WarningIcon` (`:225`), `BombIcon` (`:241`),
`FlagIcon` (`:261`). Consequências nos pontos de uso:

- `App.tsx:221` — o ícone dentro do botão da Lixeira anuncia "Lixeira cheia, imagem" e
  logo em seguida o texto visível "Lixeira / 3 itens" (`App.tsx:223-231`). Duplicado.
- `TrashWindow.tsx:76-78` e `:117-119` — **cada linha** da lixeira começa com
  "Documento, imagem" ou "Pasta, imagem" antes do título. Com 12 itens, 12 anúncios
  inúteis; e a informação já está no texto ("card de ...", "lista com N card(s)").
- `App.tsx:449` — o `TrashFullIcon` da bandeja anuncia "Lixeira cheia" no meio de
  "3 listas · 12 cards · 3".

Feito certo em `Minesweeper.tsx:231-241`: os ícones ficam dentro de um
`<span aria-hidden="true">`, então o pai os esconde e o `aria-label` do botão
(`Minesweeper.tsx:224`) descreve a célula inteira. `App.tsx:370` (`WindowsFlagIcon`, sem
`title`) também está certo.

**Correção:** remover os valores padrão de `title` em `icons.tsx` — decorativo passa a ser
o padrão e quem precisa de rótulo passa `title` explicitamente no ponto de uso. Isso
inverte o default para o lado seguro sem mexer no wrapper, que já está bem feito.
(`icons.tsx:54` combina `role="presentation"` com `aria-hidden`: redundante, mas
inofensivo.)

### M2 — Menu Iniciar sem semântica de menu

`App.tsx:363-372` — o botão "Iniciar" não tem `aria-expanded` nem `aria-haspopup`, então
não há como saber que ele abre algo nem se está aberto. `App.tsx:375-441` — o menu é uma
`<div className="window">` com `<ul><li><button>`; não tem `role="menu"`/`menuitem`, o foco
não é movido para dentro ao abrir nem devolvido ao botão ao fechar, e o fechamento por
clique fora (`App.tsx:98-103`) escuta só `click` — **`Escape` não fecha o menu Iniciar**.

**Correção:** `aria-expanded={startOpen}` e `aria-haspopup="true"` no botão; focar o
primeiro item ao abrir e devolver o foco ao botão ao fechar; um listener de `Escape`
enquanto aberto; setas `↑`/`↓` entre os itens. Manter `<ul>/<li>/<button>` é aceitável
(uma "lista de botões" é mais tolerante que um `role="menu"` mal implementado) — o que
falta mesmo é o foco e o Escape.

### M3 — Lista sem nome acessível; página sem landmarks e sem headings

`ListColumn.tsx:80` — `<section className={className}>` sem `aria-label` nem
`aria-labelledby`. Um `<section>` sem nome acessível **não** vira landmark: ele é ignorado
pela navegação por regiões. O nome existe visualmente, em `ListColumn.tsx:113-115`, mas não
está ligado a nada. `ListColumn.tsx:162` — o card é `<article>`, que também não tem nome.

Com isso um leitor de tela não consegue nem enumerar as listas do board, nem pular de uma
para a outra.

**Correção:** dar um `id` ao `.title-bar-text` (`ListColumn.tsx:106`) e apontar
`aria-labelledby` da `<section>` para ele; ou simplesmente
`aria-label={`${list.title}, ${list.cards.length} cards`}`. Envolver o título da lista num
`<h2>` cria também uma estrutura de headings navegável, hoje inexistente abaixo do `<h1>`
de `App.tsx:167`.

### M4 — O badge de "tem descrição" é invisível para AT

`ListColumn.tsx:196`:

```jsx
{card.description && <span className="card-badge" title={card.description} />}
```

Um `<span>` vazio de 6×6px (`styles.css:234-241`). Elementos inline vazios não são
expostos na árvore de acessibilidade, então o único sinal de que o card tem descrição —
e a própria descrição, carregada no `title` — é inalcançável. Reprova 1.4.1: a informação é
transmitida só por um elemento gráfico.

**Correção:** ou incluir a informação no nome acessível do card
(`aria-label={`${card.title}${card.description ? ', tem descrição' : ''}`}`), ou trocar o
`<span>` por texto escondido visualmente. Depende do B1 para que o card tenha um nome de
verdade.

### M5 — `role="list"` envolvendo um `<ul>`

`TrashWindow.tsx:153` — `<div className="trash-list" role="list">` contém, em
`TrashWindow.tsx:157`, um `<ul>` que já é uma lista. Resultado: duas listas aninhadas, e a
externa sem nenhum filho `role="listitem"` (os `<li>` pertencem à `<ul>` interna), o que é
uma estrutura ARIA inválida. Alguns leitores anunciam "lista com 0 itens" antes da lista
real.

**Correção:** remover o `role="list"` da `<div>` — ela é só o contêiner de scroll
(`styles.css:426-433`). Aproveitar para dar um nome à `<ul>`:
`aria-label="Itens na lixeira"`.

### M6 — Contrastes de texto pequeno abaixo de AA

Cálculos sobre os pares reais do CSS:

| Elemento | Cor | Fundo | Contraste | AA (4,5:1) |
|---|---|---|---|---|
| `.status.online` (`styles.css:44`) | `#006600` | `#c0c0c0` | 3,98:1 | ✗ |
| `.status.offline` (`styles.css:48`) | `#a00` | `#c0c0c0` | 4,26:1 | ✗ |
| `.empty` "(vazia)" (`styles.css:90`) | `#666` | `#c0c0c0` | 3,16:1 | ✗ |
| `.search-count` (`styles.css:540`) | `#333` | `#008080` (desktop) | 2,65:1 | ✗ |
| `.screensaver-hint` (`styles.css:637`) | `#444` | `#000` | 2,16:1 | ✗ |
| `.crash-detail` (`styles.css:177`) | `#a00` | `#c0c0c0` | 4,26:1 | ✗ |
| `.trash-info small` (`styles.css:473`) | `#555` | `#fff` | 7,46:1 | ✓ |
| `.trash-blocked` (`styles.css:479`) | `#a00` | `#fff` | 7,75:1 | ✓ |
| `h1` do board (`styles.css:26`) | `#fff` | `#008080` | 4,77:1 | ✓ |

Todos esses textos são de 11px, portanto "texto normal" — o limite frouxo de 3:1 para
texto grande não se aplica a nenhum.

O caso do `.status` é o mais relevante, porque é o indicador de conexão (ver S3) e porque
ele usa **cor sozinha** para diferenciar conectado de reconectando (verde vs. vermelho) —
o texto muda junto, o que salva 1.4.1, mas a cor não ajuda ninguém a 3,98:1.

**Correção:** escurecer para valores que passem sobre `#c0c0c0` — `#004d00` dá ~5,3:1 e
`#8b0000` dá ~5,6:1; `.empty` para `#595959` (~4,6:1); `.search-count` para `#fff` com
`text-shadow`, como o `h1` ao lado dele já faz (`styles.css:32`); `.screensaver-hint` para
`#777` (~4,7:1 sobre preto). São mudanças de um dígito hex e não afetam a estética Win95.

### M7 — Campo Minado: bandeira só por botão direito

`Minesweeper.tsx:226-229` — marcar bandeira é `onContextMenu`. O menu de contexto pode ser
aberto pela tecla ⌸ (Menu) ou `Shift+F10` na maioria dos navegadores, então tecnicamente há
um caminho — mas é obscuro e não está documentado no `role="status"` de
`Minesweeper.tsx:247-253`, que instrui "botão direito para marcar bandeira".
`Minesweeper.tsx:195` usa `role="grid"` com 81 `<button>` filhos diretos, sem `role="row"`
nem `role="gridcell"`: estrutura de grid inválida, que alguns leitores reportam como grid
vazio.

No resto, este é o melhor componente do repositório em acessibilidade:
`aria-label` por célula com linha, coluna e estado (`Minesweeper.tsx:203-212`), ícones
corretamente escondidos (`:231`), `role="status"` no aviso (`:247`), displays rotulados
(`:179`, `:190`). Serve de referência para o resto do app.

**Correção:** aceitar também `f` ou `Shift+Enter` num `onKeyDown` da célula, e mencionar na
dica; e ou envolver cada linha num `<div role="row">` com `role="gridcell"` nos botões, ou
trocar `role="grid"` por `role="group"`.

### M8 — Indicador de foco fraco

`styles.css:402-406` aplica ao ícone da Lixeira `outline: none` e substitui por
`border-color: #fff` num `border: 1px dotted` — e usa **o mesmo estilo** para `:hover` e
`:focus-visible`, o que impede distinguir "o mouse está por cima" de "o foco está aqui".
Uma borda pontilhada de 1px sobre um fundo texturizado é um indicador fraco perto do
requisito de 2.4.11/2.4.13.

Nos demais controles o app não define nada e herda o anel pontilhado do `98.css` — que é
fiel ao Windows 95 mas tem baixíssimo contraste sobre `#c0c0c0`. Nenhum outro elemento tem
`:focus-visible` no `styles.css`.

**Correção:** um `:focus-visible { outline: 2px solid #000080; outline-offset: 1px }`
global sobre botões, inputs e (depois do B1) cards, distinto do `:hover`.

### M9 — O protetor de tela não esconde o que está atrás

`ScreenSaver.tsx:44-52` cobre a tela com `position: fixed; inset: 0; z-index: 100`
(`styles.css:593-604`) e `role="presentation"`, mas não marca o conteúdo abaixo como
`aria-hidden`/`inert`. Um leitor de tela continua lendo o board inteiro por trás de uma
tela preta, e `Tab` move o foco para controles invisíveis. Como qualquer `keydown` dispensa
o protetor (`ScreenSaver.tsx:32`), o impacto prático é pequeno.

Vale registrar o acerto: `styles.css:650-654` respeita `prefers-reduced-motion` e para a
animação de deriva — é a única mídia de preferência do repositório e está correta.

---

## O que já está certo

Vale dizer, porque não é comum: `index.html:2` declara `lang="pt-BR"`;
`prefers-reduced-motion` é respeitado (`styles.css:650`); o `Svg` de `icons.tsx:41-63` tem
o mecanismo correto de decorativo vs. informativo (só o default é que está invertido);
`CardDialog.tsx:38` e `:52` usam `<label for>` de verdade, ligados por `id`; `Escape` fecha
os diálogos (`Modal.tsx:13`); `CardDialog` e `ConfirmDialog` movem o foco inicial;
`ConfirmDialog` substitui `window.confirm` por um diálogo real, com o botão seguro
("Não") separado do destrutivo; e o Campo Minado inteiro (`Minesweeper.tsx`) é um exemplo
de como o board deveria ter sido escrito.

## Ordem sugerida de trabalho

1. **B1 + B2** — a alternativa por teclado para mover/abrir/renomear. É o item que muda o
   app de "inacessível" para "acessível", e os outros bloqueantes são pequenos perto dele.
2. **B3, B4** — dois `aria-label` e um `onClick`. Meia hora, impacto grande.
3. **S1, S2** — foco no `Modal`; conserta seis diálogos de uma vez.
4. **S3, S4, S10** — `role="status"` / `role="alert"`; três linhas cada.
5. **S5, S6, S7, M6** — contraste e rótulos.
6. **S8, S9, M1–M9** — o resto.

## Anexo: como os contrastes foram calculados

Fórmula de WCAG 2.x. Para cada canal `c ∈ {R,G,B}` normalizado em `[0,1]`:

```
lin(c) = c/12.92                    se c ≤ 0,03928
lin(c) = ((c + 0,055)/1,055)^2,4    caso contrário

L = 0,2126·lin(R) + 0,7152·lin(G) + 0,0722·lin(B)
contraste = (L_claro + 0,05) / (L_escuro + 0,05)
```

Para o `.card-dimmed`, a cor efetiva é a composição alfa do card sobre o fundo da lista,
canal a canal: `resultado = frente × α + fundo × (1 − α)`, com `α = 0,35`,
frente do texto `#222` (do `98.css`), frente do fundo `#fff` (`styles.css:97`), e fundo
`#c0c0c0` (`.window-body` do `98.css`).
