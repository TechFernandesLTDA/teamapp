# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

Um clone básico de Trello com visual de Windows 95. É construído por **duas sessões do Claude Code em paralelo**, então este arquivo é antes de tudo um *contrato* entre elas.

| Sessão | Diretório que ela possui | Não edita |
|---|---|---|
| `backend` | `backend/` (inclui `backend/prisma/`), `docker-compose.yml` | `frontend/` |
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

Depois de mudar `backend/prisma/schema.prisma` rode `npx prisma migrate dev --name <descricao>`; sem isso o Prisma Client fica desatualizado e o TypeScript quebra em lugares que não têm relação com a mudança.

## Portas e origens

| Serviço | Porta | Observação |
|---|---|---|
| API + WebSocket | `3001` | mesmo processo, mesma porta |
| Frontend (Docker, nginx) | `8090` | build estático (8080 estava ocupado no host) |
| Frontend (vite dev) | `5173` | |

O browser fala com a API **direto** em `http://localhost:3001` — não há proxy reverso na frente dela. Isso é deliberado: proxiar o upgrade do WebSocket pelo nginx é a fonte número um de falha silenciosa nesse tipo de stack. O CORS do backend libera `5173`, `8080` e `8090` — e precisa declarar `methods` explicitamente, porque o default do `@fastify/cors` (`GET,HEAD,POST`) reprova PATCH e DELETE no preflight e derruba o drag-and-drop no browser.

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

Eventos: `list.created`, `list.updated`, `list.deleted`, `card.created`, `card.updated`, `card.moved`, `card.deleted`, `trash.updated`, `activity.recorded`.

### A Lixeira: DELETE é soft delete

`DELETE /api/cards/:id` e `DELETE /api/lists/:id` **não apagam** — marcam `deletedAt` e o
item vai para a lixeira, de onde pode voltar. Só as rotas `/api/trash` apagam de verdade.

A consequência que pega desprevenido: `findUnique({ where: { id } })` continua achando a
linha. **Toda rota que opera sobre um recurso vivo precisa filtrar `deletedAt: null`** —
use `findLiveCard()`/`findLiveList()` de `backend/src/trash.ts` em vez de escrever o where
na mão. Sem isso dá para renomear, mover e criar cards dentro de coisas que o board não
mostra mais.

Mandar uma lista para a lixeira **não** marca os cards dela: eles somem porque a lista
sumiu, e voltam junto na restauração. Marcar em cascata ressuscitaria cards que já tinham
sido jogados fora sozinhos.

Restaurar reusa `card.created`/`list.created` em vez de inventar `*.restored`: o cliente
já aplica esses eventos como upsert por `id`, então o item reaparece sem mudança no
reducer. `trash.updated` carrega **só a contagem** `{ cards, lists }` — o conteúdo vem de
`GET /api/trash` quando a janela abre.

### Concorrencia: ler-e-inserir precisa ser atomico

Toda rota que calcula uma position a partir do estado atual (`POST /api/cards`,
`POST /api/lists` — ambas fazem "ultima + 1") tem que envolver a leitura **e** a
escrita em `serialize()` de `backend/src/serialize.ts`. Sem isso duas criacoes
simultaneas leem a mesma "ultima" e nascem empatadas, e dois itens empatados
tornam o drag entre eles inoperante: `positionFor()` devolve `(a+b)/2 === a`, o
servidor responde 200 e o card nao se move. O desempate por `id` esconde o
sintoma. Detalhes no fim de `docs/API.md`.

### API REST

Contrato completo, com formatos de payload e códigos de erro, em **`docs/API.md`**. Resumo:

```
GET    /api/health
GET    /api/board                     board default com lists e cards aninhados, já ordenados
POST   /api/lists                     { title }
PATCH  /api/lists/:id                 { title?, position? }
DELETE /api/lists/:id                 -> lixeira, leva os cards junto
POST   /api/cards                     { listId, title, description? }
PATCH  /api/cards/:id                 { title?, description? }
PATCH  /api/cards/:id/move            { listId, position }   <- o drag-and-drop
DELETE /api/cards/:id                 -> lixeira, nao apaga

GET    /api/trash                     { cards, lists, counts }
POST   /api/trash/cards/:id/restore   409 se a lista de origem esta na lixeira
POST   /api/trash/lists/:id/restore
DELETE /api/trash/cards/:id           apaga de vez
DELETE /api/trash/lists/:id           apaga de vez
DELETE /api/trash                     esvaziar lixeira

GET    /api/activity?limit=50         log de atividade, mais recente primeiro
DELETE /api/activity                  limpa o log
GET    /api/stats                     contagens e agregados do board
```

`GET /api/board` é a única leitura de que o frontend precisa; depois dela o estado se mantém pelo WebSocket. Não crie endpoints `GET` por recurso individual sem necessidade real.

## Visual Windows 95

O frontend usa o pacote npm **`98.css`** (não CDN — o container precisa buildar offline). Cada lista é uma `.window` com `.title-bar`, cada card é um item dentro de `.window-body`. Não escreva CSS que recrie bordas ou botões que o `98.css` já fornece; use as classes dele e limite o CSS próprio a layout (o board é um flex row com scroll horizontal).

Drag-and-drop é HTML5 nativo (`draggable`, `dragover`, `drop`) — sem biblioteca.

### Ícones

`frontend/src/icons.tsx` tem os ícones em SVG pixel art, desenhados numa grade de
16x16 com a paleta VGA de 16 cores. **São recriações próprias, não os arquivos da
Microsoft** — os ícones originais do Windows 95 são proprietários e este repositório
é público.

Três regras mantêm a aparência: `shapeRendering="crispEdges"` (sem isso o navegador
aplica antialias e o resultado parece um ícone moderno borrado), escalar só em
múltiplos inteiros do tamanho base (16, 32, 48 — um ícone de 16px renderizado em
20px mostra linhas de espessura irregular), e nada de emoji na UI: é o detalhe que
denuncia a imitação mais rápido que qualquer outro.

### Busca: realce, não filtro

A busca marca os cards que casam e esmaece o resto, em vez de esconder os que não
casam. Filtrar mudaria os vizinhos de cada card, e como `positionFor()` calcula a
posição nova a partir dos vizinhos do destino, arrastar durante uma busca gravaria
a posição errada.
