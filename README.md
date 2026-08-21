# teamapp

Um clone básico de Trello com o visual do Windows 95. Um único board, listas
arrastáveis, cards com drag-and-drop entre colunas, lixeira com restauração e
sincronização em tempo real entre abas por WebSocket — tudo dentro de janelas
`98.css`, com barra de título, botões chanfrados e taskbar.

Sem autenticação e sem multiusuário: qualquer um que abrir a página vê o mesmo
board. A tela de login, quando existe, é puramente cosmética.

## Screenshot

<!-- TODO: substituir pelo screenshot real do board -->

![Board do teamapp com visual Windows 95](docs/screenshot.png)

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Fastify 5 (REST + WebSocket no mesmo processo) |
| Persistência | Prisma 6 + SQLite |
| Frontend | React 19 + TypeScript + Vite 6 |
| Visual | pacote npm `98.css` (não CDN — o container builda offline) |
| Drag-and-drop | HTML5 nativo (`draggable` / `dragover` / `drop`), sem biblioteca |
| Empacotamento | Docker Compose (backend em Node 24, nginx servindo o build estático) |

## Quickstart

Requer Docker e Docker Compose.

```bash
docker compose up --build
```

- Frontend: <http://localhost:8090>
- API + WebSocket: <http://localhost:3001>

O board padrão (`slug: "default"`) é criado pelo seed na primeira subida.

```bash
docker compose down          # para o stack, preserva os dados
docker compose down -v       # -v apaga o volume do SQLite (reset total)
docker compose logs -f backend
```

### Por que a porta 8090

A escolha natural seria 8080, mas ela já estava ocupada na máquina de
desenvolvimento — o nginx do container continua escutando na 80 e o mapeamento é
`8090:80`. Se 8090 também estiver ocupada para você, mude só o lado esquerdo do
mapeamento em `docker-compose.yml`.

O browser fala com a API **direto** em `http://localhost:3001`; não há proxy
reverso na frente dela. Isso é deliberado: proxiar o upgrade do WebSocket pelo
nginx é a fonte número um de falha silenciosa nesse tipo de stack.

## Desenvolvimento local

Duas abas de terminal. Node 24 (o backend roda em `node:24-slim` no Docker).

### Backend — porta 3001

```bash
cd backend
npm install
npx prisma migrate dev      # cria/atualiza dev.db e o Prisma Client
npm run seed                # recria o board padrão
npm run dev                 # tsx watch, :3001
```

Produção: `npm run build && npm start`.

Depois de mexer em `prisma/schema.prisma`, rode
`npx prisma migrate dev --name <descricao>`. Sem isso o Prisma Client fica
desatualizado e o TypeScript quebra em lugares que não têm relação com a
mudança.

### Frontend — porta 5173

```bash
cd frontend
npm install
npm run dev                 # vite, :5173 -> chama a API em :3001
npm run build               # tsc -b && vite build -> dist/
```

A base da API vem de `VITE_API_URL` (default `http://localhost:3001`). O Vite
resolve env vars em **build time**, por isso o `docker-compose.yml` passa o
valor como build arg e não como variável de runtime do container.

O CORS do backend libera as origens `5173`, `8080` e `8090`, e declara os
métodos explicitamente — o default do `@fastify/cors` (`GET,HEAD,POST`) reprova
PATCH e DELETE no preflight e derruba o drag-and-drop no browser.

## Estrutura

```
teamapp/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       Board 1─n List 1─n Card
│   │   ├── migrations/
│   │   └── seed.ts             cria o board "default"
│   ├── scripts/
│   │   └── smoke.mjs           smoke test do contrato (REST + WebSocket)
│   ├── src/
│   │   ├── server.ts           Fastify: CORS, error handlers, WebSocket, rotas
│   │   ├── bus.ts              broadcast dos eventos para todos os clientes
│   │   ├── db.ts               Prisma Client
│   │   ├── trash.ts            regras do soft delete
│   │   └── routes/             board.ts · lists.ts · cards.ts · trash.ts
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api.ts              wrappers dos endpoints + a matemática do drag
│   │   ├── useBoard.ts         GET /api/board, WebSocket com backoff, reducer
│   │   ├── App.tsx             board, header, taskbar, estado do drag
│   │   ├── ListColumn.tsx      uma lista (.window) e seus alvos de drop
│   │   ├── CardDialog.tsx      edição de título/descrição
│   │   └── styles.css          só layout — bordas e botões vêm do 98.css
│   ├── nginx.conf
│   └── Dockerfile
├── docs/
│   ├── API.md                  contrato completo da API
│   ├── BACKEND-REQUESTS.md     canal frontend -> backend
│   └── FRONTEND-REQUESTS.md    canal backend -> frontend
├── docker-compose.yml
└── CLAUDE.md                   o contrato entre as duas sessões de desenvolvimento
```

## API

O contrato completo — payloads, códigos de erro, eventos de WebSocket e as
regras da lixeira — está em **[`docs/API.md`](docs/API.md)**.

Resumo:

```
GET    /api/health
GET    /api/board                     board default, lists e cards já ordenados
POST   /api/lists                     PATCH /api/lists/:id      DELETE /api/lists/:id
POST   /api/cards                     PATCH /api/cards/:id      DELETE /api/cards/:id
PATCH  /api/cards/:id/move            { listId, position }   <- o drag-and-drop
GET    /api/trash                     restore e delete definitivo em /api/trash/...
ws://localhost:3001/ws                eventos de toda mutação
```

Duas coisas que valem saber antes de ler o resto:

- **`position` é um `Float` fracionário**, não um índice inteiro. Mover um card
  entre `a` e `b` grava `(a.position + b.position) / 2`. Uma única linha por
  drag; quem calcula a posição é o cliente, que conhece os vizinhos.
- **Todo evento de WebSocket vai para todos os clientes, inclusive o autor da
  mutação.** O cliente aplica cada evento como upsert idempotente por `id` —
  aplicar duas vezes tem que dar o mesmo resultado.

## Testes

Com o stack no ar:

```bash
node backend/scripts/smoke.mjs                          # default http://localhost:3001
node backend/scripts/smoke.mjs http://localhost:3001
```

O script exercita os endpoints, o preflight de CORS de cada método e o broadcast
do WebSocket. Sai com código 1 na primeira falha de asserção.

## Contribuindo

Veja [`CONTRIBUTING.md`](CONTRIBUTING.md). Em resumo: Conventional Commits, CI
verde, e mudança de comportamento da API significa atualizar `CLAUDE.md` **e**
`docs/API.md` no mesmo PR.

## Licença

MIT — veja [`LICENSE`](LICENSE).
