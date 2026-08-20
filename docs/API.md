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

`200 Board`

### `POST /api/lists`
`{ title: string }` — `position` é calculada pelo servidor (última + 1).
`201 List` (com `cards: []`) · evento `list.created`

### `PATCH /api/lists/:id`
`{ title?: string, position?: number }`
`200 List` · evento `list.updated`

### `DELETE /api/lists/:id`
Apaga a lista e seus cards em cascata.
`204` · evento `list.deleted` com payload `{ id }`

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
`204` · evento `card.deleted` com payload `{ id }`

## WebSocket

`ws://localhost:3001/ws`. Sem handshake, sem subscribe: ao conectar você recebe todo evento subsequente.

Toda mensagem é `{ type, payload }`. O broadcast vai para **todos** os clientes, incluindo o que originou a mutação — aplique os eventos como upsert idempotente por `id`.

| `type` | `payload` |
|---|---|
| `list.created` | `List` |
| `list.updated` | `List` |
| `list.deleted` | `{ id }` |
| `card.created` | `Card` |
| `card.updated` | `Card` |
| `card.moved` | `{ id, listId, position }` |
| `card.deleted` | `{ id }` |

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
