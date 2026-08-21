# Contrato da API

Base: `http://localhost:3001`. Tudo é JSON. Erros retornam `{ "error": "mensagem" }` com status `400` (payload inválido), `404` (recurso inexistente) ou `500`.

## Modelos

```ts
type Board = { id: string; slug: string; title: string; lists: List[] }
type List  = { id: string; boardId: string; title: string; position: number; cards: Card[] }
type Card  = { id: string; listId: string; title: string; description: string; position: number }
```

`id` é `cuid` (string). `position` é `Float` fracionário — ver CLAUDE.md. `description` nunca é `null`, é `""` quando vazia.

## Endpoints

### `GET /api/health`
`200 { "status": "ok" }`

### `GET /api/board`
Retorna o board `default` com `lists` ordenadas por `position` asc e, dentro de cada uma, `cards` ordenados por `position` asc. É a única chamada de leitura que o frontend precisa fazer.

Itens na lixeira **não aparecem aqui** — nem listas, nem cards. A resposta traz também
`trash: { cards, lists }`, a contagem do que está na lixeira, para o ícone do desktop
nascer no estado certo sem um `GET /api/trash` extra.

`200 Board & { trash: { cards, lists } }`

### `POST /api/lists`
`{ title: string }` — `position` é calculada pelo servidor (última + 1).
`201 List` (com `cards: []`) · evento `list.created`

### `PATCH /api/lists/:id`
`{ title?: string, position?: number }`
`200 List` · evento `list.updated`

### `DELETE /api/lists/:id`
**Manda a lista para a lixeira** (soft delete) — não apaga. Ela some do `GET /api/board`
junto com todos os seus cards e passa a aparecer em `GET /api/trash`.

Os cards da lista **não** são marcados individualmente: eles somem porque a lista sumiu e
voltam junto na restauração. Um card que já tinha ido para a lixeira sozinho continua lá
mesmo depois de a lista voltar.

`204` · eventos `list.deleted` com payload `{ id }` **e** `trash.updated`

Do ponto de vista do board o evento é o mesmo de antes: remova a lista por `id`.

### `POST /api/cards`
`{ listId: string, title: string, description?: string }` — `position` é calculada pelo servidor (última da lista + 1).
`201 Card` · evento `card.created`

### `PATCH /api/cards/:id`
`{ title?: string, description?: string }` — **não** move o card.
`200 Card` · evento `card.updated`

### `PATCH /api/cards/:id/move`
`{ listId: string, position: number }` — o endpoint do drag-and-drop. O cliente calcula `position` a partir dos vizinhos do destino: entre `a` e `b` é `(a.position + b.position) / 2`; no topo é `primeiro.position - 1`; no fim é `último.position + 1`; em lista vazia é `0`. `listId` é obrigatório mesmo quando o card não muda de lista.
`200 Card` · evento `card.moved` com payload `{ id, listId, position }`

### `DELETE /api/cards/:id`
**Manda o card para a lixeira** (soft delete) — não apaga.

`204` · eventos `card.deleted` com payload `{ id }` **e** `trash.updated`

### A Lixeira

Soft delete muda o significado de "existe": a linha continua no banco, mas invisível para
o board. **Toda rota que opera sobre um recurso vivo filtra `deletedAt: null`** — renomear,
mover, ou criar um card dentro de uma lista que está na lixeira retorna `404`, como se o
recurso não existisse. É o comportamento que você quer no cliente: um item na lixeira não
é um item editável.

#### `GET /api/trash`
```json
{
  "cards": [{ "id": "...", "title": "...", "description": "...", "position": 3,
              "listId": "...", "deletedAt": "2026-08-21T04:12:00.000Z",
              "originalList": { "id": "...", "title": "A Fazer", "deleted": false } }],
  "lists": [{ "id": "...", "title": "...", "position": 1, "boardId": "...",
              "deletedAt": "...", "cardCount": 4 }],
  "counts": { "cards": 1, "lists": 0 }
}
```
Mais recente primeiro. `originalList.deleted` diz que a lista de origem também está na
lixeira — nesse caso o restore do card retorna `409`, então dá para esmaecer o botão
"Restaurar" antes do clique em vez de mostrar um erro. `cardCount` é quantos cards voltam
junto se a lista for restaurada.

`200`

#### `POST /api/trash/cards/:id/restore`
Devolve o card à posição original. `200 Card` · eventos **`card.created`** e `trash.updated`.

O evento é `card.created`, não um tipo novo: o cliente já aplica esse evento como upsert
por `id`, então restaurar aparece no board sem nenhuma mudança no reducer.

`404` se o card não está na lixeira · `409` se a lista de origem está na lixeira
(restaure a lista primeiro).

#### `POST /api/trash/lists/:id/restore`
`200 List` **com `cards[]` populado** (só os cards vivos) · eventos **`list.created`** e
`trash.updated`. Os cards vêm junto de propósito — uma lista sem eles faria o cliente
fazer upsert de uma lista vazia por cima da que tem conteúdo.

`404` se a lista não está na lixeira.

#### `DELETE /api/trash/cards/:id` · `DELETE /api/trash/lists/:id`
Apaga **de verdade**, irreversível. `204` · evento `trash.updated`.

Não emite `card.deleted`/`list.deleted`: para o board o item já tinha sumido no soft delete.
Apagar uma lista de vez leva os cards dela em cascata, inclusive os que estavam na lixeira
por conta própria. `404` se o item não está na lixeira (apagar um item **vivo** por aqui
não funciona — use `DELETE /api/cards/:id`).

#### `DELETE /api/trash`
Esvaziar Lixeira. Apaga tudo de vez. `200 { deleted: { cards, lists } }` · evento `trash.updated`.

### Log de atividade e estatisticas

#### `GET /api/activity?limit=50`
Log append-only de toda mutacao, mais recente primeiro. `limit` aceita 1..200
(default 50); fora disso e `400`. Resposta: `{ items: [{ id, type, summary, createdAt }], limit, total }`.

`summary` ja vem formatado (`Card "Gravar um CD-R" movido para "Feito"`) — o cliente
imprime a frase, nunca a remonta a partir de ids.

Gravar log **nunca derruba a mutacao principal**: se o insert falhar, o servidor loga
e segue. Um log de auditoria que quebra a escrita e pior do que nao ter log.

#### `DELETE /api/activity`
Limpa o log. `200 { deleted: n }`. Idempotente.

#### `GET /api/stats`
`{ lists, cards, trashedCards, trashedLists, cardsPerList, oldestCard, newestCard, avgCardsPerList }`.
Só conta itens vivos.

## WebSocket

`ws://localhost:3001/ws`. Sem handshake, sem subscribe: ao conectar você recebe todo evento subsequente.

Toda mensagem é `{ type, payload }`. O broadcast vai para **todos** os clientes, incluindo o que originou a mutação — aplique os eventos como upsert idempotente por `id`.

`trash.updated` é o único evento que não fala de um recurso específico: o payload é só a
contagem, para o ícone do desktop saber se a lixeira está cheia. O conteúdo vem de
`GET /api/trash` quando a janela abre — mandar a lixeira inteira em cada delete violaria
a regra de que o payload nunca é o estado todo.

| `type` | `payload` |
|---|---|
| `list.created` | `List` |
| `list.updated` | `List` |
| `list.deleted` | `{ id }` |
| `card.created` | `Card` |
| `card.updated` | `Card` |
| `card.moved` | `{ id, listId, position }` |
| `card.deleted` | `{ id }` |
| `trash.updated` | `{ cards, lists }` — só a contagem |
| `activity.recorded` | `{ id, type, summary, createdAt }` |

Se a conexão cair, o cliente deve reconectar com backoff e refazer `GET /api/board` ao reconectar — eventos perdidos durante a queda não são reenviados.

## Detalhes que o contrato não dizia (fechados após o QA)

**Envelope de erro vale para TODA falha**, não só as das rotas. JSON malformado, rota
inexistente e payload grande demais também respondem `{ "error": "..." }`. O Fastify por
default responde `{statusCode, code, error, message}` nesses casos pré-rota — o cliente lê
`.error` e mostraria `"Bad Request"` em vez da mensagem útil. Por isso `setErrorHandler` e
`setNotFoundHandler` são registrados **antes** das rotas em `backend/src/server.ts`: um
handler registrado depois não é herdado pelos contextos já registrados.

**CORS precisa declarar os métodos explicitamente.** O default do `@fastify/cors` é
`GET,HEAD,POST` — PATCH e DELETE são reprovados no preflight, o que mata `moveCard`,
`updateCard`, `deleteCard`, `deleteList` e `renameList` no browser. Liberar só a origem não
basta. `curl` não aplica CORS, então um smoke test feito só com curl passa com isso
totalmente quebrado; `backend/scripts/smoke.mjs` agora testa o preflight de cada método.

**Empate de `position` desempata por `id`.** `orderBy: [{position}, {id}]` — sem isso, dois
cards com a mesma position saem em ordem arbitrária do SQLite e o board "embaralha" sozinho
entre dois GETs.

**Limite conhecido da position fracionária:** entre dois inteiros vizinhos cabem ~53
divisões pela metade antes do float esgotar a precisão e os valores empatarem. Não há
rebalanceamento. Na prática só se chega lá arrastando repetidamente para o mesmo ponto
milhares de vezes; se virar problema, a saída é reescrever a coluna com posições inteiras.

**`PATCH /api/cards/:id` ignora `listId` e `position` em silêncio.** Só `title` e
`description` são aplicados. Para mover, use `PATCH /api/cards/:id/move`.

**WebSocket é só servidor → cliente.** Mensagens enviadas pelo cliente são ignoradas (não
há `socket.on('message')` no servidor). Conexões de origem não listada são fechadas com
código `1008`; conexões sem header `Origin` (curl, scripts) são aceitas.

**`POST` calcula a próxima position como "última + 1"** sobre o valor fracionário — depois
de um card em `7.125`, o próximo nasce em `8.125`.


---

## Concorrencia: `POST` serializa a leitura da position (2026-08-21)

`POST /api/cards` e `POST /api/lists` calculam a position nova como "ultima + 1", o
que exige **ler e inserir atomicamente**. Sem isso duas criacoes simultaneas leem a
mesma "ultima" e nascem empatadas — 15 requisicoes em paralelo produziam 5 positions
distintas.

O empate nao e cosmetico: a partir de dois cards na mesma position, `positionFor()`
calcula `(a + b) / 2 === a` para o slot entre eles. O servidor responde `200`, grava o
valor recebido, e **o card nao sai do lugar**. Como o `orderBy` desempata por `id`, a
ordem continua estavel e nada parece quebrado — o drag simplesmente para de funcionar.

Uma transacao do Prisma nao resolve sozinha: no SQLite o `BEGIN` e deferido, o `SELECT`
nao pega lock de escrita, e as duas transacoes leem antes de qualquer uma escrever.
`backend/src/serialize.ts` enfileira por lista/board.

**Limite conhecido:** e um mutex em memoria, valido enquanto houver **um processo** de
backend — que e o modelo de implantacao aqui. Com mais de uma instancia o race volta, e
a correcao passa a ser `INSERT ... SELECT MAX(position) + 1` numa unica declaracao, ou
`UNIQUE(listId, position)` com retry.

Coberto por `backend/scripts/ws-stress.mjs`, que roda no CI.
