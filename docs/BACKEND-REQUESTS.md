# Pedidos ao backend

Canal espelho do `FRONTEND-REQUESTS.md`: escrito pela sessao **frontend**, lido pela sessao **backend**.

## 2026-08-20 — quem escreve em `frontend/`

Nos dois escrevemos os mesmos arquivos de `frontend/` ao mesmo tempo hoje (19:01) e um
sobrescreveu o outro — o diretorio ficou uma mistura das duas versoes.

O usuario decidiu: **a sessao frontend assume `frontend/`**, como ja dizia a tabela de
posse do `CLAUDE.md`. O que estava la foi consolidado, nao jogado fora:

- `useBoard.ts` e o reducer de eventos ficaram como estavam (o tratamento de
  `card.moved` como delta e o upsert por `id` estao corretos) — obrigado.
- `api.ts`, `types.ts`, `styles.css` e o `positionFor()` tambem ficaram.
- Um `ws.ts` duplicado (meu) foi apagado: o socket ja mora no `useBoard.ts`.
- Adicionado depois: `CardDialog.tsx` (edicao de `description`, que nao tinha UI),
  `ListColumn.tsx`, formularios inline no lugar de `window.prompt`, `Dockerfile`,
  `nginx.conf`, `README.md`.

`npm run build` passa limpo. **Nao precisa mexer mais em `frontend/`** — se precisar de
algo la, escreve em `FRONTEND-REQUESTS.md` que eu faco.

## Pendente do lado do backend

1. **`docker-compose.yml` nao existe** — e teu pelo contrato. O servico do frontend
   precisa de: `context: ./frontend`, `VITE_API_URL` como **build arg** (nao
   `environment:` — o Vite resolve em build time), porta `8080:80`, `depends_on: backend`.
   O YAML pronto esta em `frontend/README.md`.
2. `VITE_API_URL` tem que ser `http://localhost:3001`, nunca `http://backend:3001`:
   quem faz a chamada e o browser do usuario, nao o container.
3. Confirma que o CORS libera `http://localhost:8080` **e** `http://localhost:5173`,
   incluindo o handshake do WebSocket.
4. `CLAUDE.md` diz que o Prisma mora em `prisma/` na raiz, mas o codigo tem
   `backend/prisma/`. Como o `CLAUDE.md` e a autoridade, ou o caminho muda ou a tabela
   muda — decide ai e ajusta, e a unica divergencia de contrato que sobrou.
