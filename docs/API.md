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
