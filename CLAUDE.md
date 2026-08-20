# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

Um clone básico de Trello com visual de Windows 95. É construído por **duas sessões do Claude Code em paralelo**, então este arquivo é antes de tudo um *contrato* entre elas.

| Sessão | Diretório que ela possui | Não edita |
|---|---|---|
| `backend` | `backend/`, `prisma/`, `docker-compose.yml` | `frontend/` |
| `frontend` | `frontend/` | `backend/` |

`CLAUDE.md` e `docs/` são compartilhados: quem muda o contrato edita aqui **e** avisa na outra sessão. Se o código e este arquivo divergirem, **este arquivo é a autoridade** — o código está errado e deve ser corrigido.

As sessões não conversam entre si. O handoff é por arquivo, um canal em cada direção: `docs/FRONTEND-REQUESTS.md` (backend escreve, frontend lê) e `docs/BACKEND-REQUESTS.md` (frontend escreve, backend lê). Leia o seu no início da sessão.

## Comandos

```bash
# Stack completo (o jeito normal de rodar)
docker compose up --build          # frontend em :8090, API em :3001
docker compose down -v             # -v apaga o volume do SQLite (reset total)
docker compose logs -f backend

# Backend, fora do Docker (iteração rápida)
cd backend
npm install
npx prisma migrate dev             # cria/atualiza dev.db e o Prisma Client
npm run dev                        # tsx watch, :3001
npm run seed                       # recria o board padrão
npm run build && npm start         # compilação de produção

# Frontend, fora do Docker
cd frontend
npm install
npm run dev                        # vite, :5173 -> chama a API em :3001
npm run build
```

Depois de mudar `prisma/schema.prisma` rode `npx prisma migrate dev --name <descricao>`; sem isso o Prisma Client fica desatualizado e o TypeScript quebra em lugares que não têm relação com a mudança.

## Portas e origens

| Serviço | Porta | Observação |
|---|---|---|
| API + WebSocket | `3001` | mesmo processo, mesma porta |
| Frontend (Docker, nginx) | `8090` | build estático (8080 estava ocupado no host) |
| Frontend (vite dev) | `5173` | |

O browser fala com a API **direto** em `http://localhost:3001` — não há proxy reverso na frente dela. Isso é deliberado: proxiar o upgrade do WebSocket pelo nginx é a fonte número um de falha silenciosa nesse tipo de stack. O CORS do backend libera `5173`, `8080` e `8090`.

O frontend lê a base da API de `VITE_API_URL` (default `http://localhost:3001`). Como o Vite injeta env vars em build time, o `docker-compose.yml` passa isso como build arg, não como variável de runtime.

## Arquitetura

Um único board (`slug: "default"`), criado pelo seed. Sem autenticação e sem multiusuário — a tela de login do Windows 95, se existir, é puramente cosmética no frontend.

```
Board 1─n List 1─n Card
```

**Fastify** serve REST e WebSocket no mesmo processo (`backend/src/server.ts`). **Prisma + SQLite** é a persistência; o arquivo do banco fica num volume nomeado do Docker, nunca num bind mount do Windows — o file locking do SQLite sobre bind mount do Docker Desktop falha de forma intermitente.

### Ordenação de cards: `position` é fracionário

`position` é um `Float`, não um índice inteiro. Para mover um card entre os vizinhos `a` e `b`, a posição nova é `(a.position + b.position) / 2`; no topo é `first.position - 1`, no fim é `last.position + 1`. Uma única linha é gravada por drag.

Isso não é otimização prematura, é o que mantém as duas sessões compatíveis: com índice inteiro cada drag reescreve a coluna inteira e as duas pontas acabam implementando semânticas de reordenação incompatíveis. O cálculo da nova posição é responsabilidade do **cliente** — ele conhece os vizinhos; o servidor só persiste o float que recebe.

### WebSocket

Endpoint `ws://localhost:3001/ws`. Toda mutação REST bem-sucedida faz broadcast de um evento para **todos** os clientes conectados, **inclusive quem originou a mudança**. Não filtre o autor: fazer isso exige rastrear identidade de conexão e é onde nascem os bugs de estado divergente.

A consequência é que o cliente precisa aplicar todo evento como um **upsert idempotente por `id`** — aplicar duas vezes tem que dar o mesmo resultado, porque quem faz uma mutação vê tanto a resposta HTTP quanto o eco do WebSocket.

Formato: `{ "type": "card.moved", "payload": { ... } }`. O payload de movimento é só `{ id, listId, position }`, nunca o board inteiro.

Eventos: `list.created`, `list.updated`, `list.deleted`, `card.created`, `card.updated`, `card.moved`, `card.deleted`.

### API REST

Contrato completo, com formatos de payload e códigos de erro, em **`docs/API.md`**. Resumo:

```
GET    /api/health
GET    /api/board                     board default com lists e cards aninhados, já ordenados
POST   /api/lists                     { title }
PATCH  /api/lists/:id                 { title?, position? }
DELETE /api/lists/:id                 cascateia nos cards
POST   /api/cards                     { listId, title, description? }
PATCH  /api/cards/:id                 { title?, description? }
PATCH  /api/cards/:id/move            { listId, position }   <- o drag-and-drop
DELETE /api/cards/:id
```

`GET /api/board` é a única leitura de que o frontend precisa; depois dela o estado se mantém pelo WebSocket. Não crie endpoints `GET` por recurso individual sem necessidade real.

## Visual Windows 95

O frontend usa o pacote npm **`98.css`** (não CDN — o container precisa buildar offline). Cada lista é uma `.window` com `.title-bar`, cada card é um item dentro de `.window-body`. Não escreva CSS que recrie bordas ou botões que o `98.css` já fornece; use as classes dele e limite o CSS próprio a layout (o board é um flex row com scroll horizontal).

Drag-and-drop é HTML5 nativo (`draggable`, `dragover`, `drop`) — sem biblioteca.
