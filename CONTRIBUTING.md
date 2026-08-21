# Contribuindo

Obrigado pelo interesse. Este documento é curto de propósito: leia `CLAUDE.md`
antes de abrir um PR, ele é a autoridade sobre o contrato do projeto.

## Rodando o projeto

O jeito normal é o stack completo:

```bash
docker compose up --build     # frontend em :8090, API em :3001
docker compose down -v        # -v apaga o volume do SQLite (reset total)
```

Para iterar rápido, rode fora do Docker, em dois terminais:

```bash
cd backend
npm install
npx prisma migrate dev        # cria/atualiza dev.db e o Prisma Client
npm run dev                   # tsx watch, :3001

cd frontend
npm install
npm run dev                   # vite, :5173 -> chama a API em :3001
```

Node 24 (é o que o `backend/Dockerfile` e o CI usam).

Depois de mexer em `backend/prisma/schema.prisma`, rode
`npx prisma migrate dev --name <descricao>`. Sem isso o Prisma Client fica
desatualizado e o TypeScript quebra em arquivos que não têm relação com a
mudança.

## Testando

Não há suíte unitária. O que existe — e o que o CI roda — é um smoke test do
contrato, contra um stack **de pé**:

```bash
docker compose up -d --build
node backend/scripts/smoke.mjs             # default http://localhost:3001
node backend/scripts/smoke.mjs http://outro-host:3001
```

Ele exercita os endpoints REST, o preflight de CORS de cada método (`curl` não
aplica CORS, então um smoke feito só com curl passa com o drag-and-drop
totalmente quebrado no browser) e o broadcast do WebSocket. Sai com código 1 na
primeira asserção que falhar.

Antes de abrir o PR, garanta também o que o CI checa:

```bash
cd backend  && npm ci && npx prisma generate && npx tsc --noEmit
cd frontend && npm ci && npm run build
```

Se você mexeu em drag-and-drop, lixeira ou WebSocket, teste **com duas abas
abertas**: metade dos bugs desta base só aparece quando o eco do broadcast chega
em quem originou a mutação.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/):

```
<tipo>(<escopo opcional>): <descrição no imperativo, minúscula, sem ponto final>
```

Tipos usados aqui: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`,
`build`, `perf`, `style`. Escopos típicos: `backend`, `frontend`, `api`,
`docker`, `ci`, `trash`, `ws`.

```
feat(frontend): adiciona janela da lixeira na taskbar
fix(backend): declara methods no CORS para liberar PATCH e DELETE
docs(api): documenta o evento trash.updated
```

Breaking change vai com `!` antes dos dois-pontos (`feat(api)!: ...`) e uma
seção `BREAKING CHANGE:` no corpo. Um commit por mudança lógica; não misture
refatoração com correção de bug.

## O contrato entre as duas sessões

Este repositório é construído por **duas sessões do Claude Code em paralelo**,
que não conversam entre si:

| Sessão | Possui | Não edita |
|---|---|---|
| `backend` | `backend/` (inclui `backend/prisma/`), `docker-compose.yml` | `frontend/` |
| `frontend` | `frontend/` | `backend/` |

`CLAUDE.md` e `docs/` são compartilhados. O handoff é por arquivo, um canal em
cada direção: `docs/FRONTEND-REQUESTS.md` (backend escreve, frontend lê) e
`docs/BACKEND-REQUESTS.md` (frontend escreve, backend lê).

Consequências práticas para qualquer PR:

1. **`CLAUDE.md` é a autoridade.** Se o código divergir dele, o errado é o
   código — corrija o código, ou mude o contrato deliberadamente.
2. **Mudar o contrato exige atualizar `CLAUDE.md` e `docs/API.md` no mesmo
   PR.** Contrato aqui significa: forma de payload, código de status, nome ou
   payload de evento de WebSocket, semântica de `position`, portas e origens de
   CORS, ou quem é dono de qual diretório. Uma dessas mudanças sem a
   documentação correspondente é um PR incompleto, mesmo com o CI verde — o CI
   não tem como perceber que a outra ponta ficou para trás.
3. **Não edite o diretório da outra sessão** no mesmo PR. Se precisa de algo do
   outro lado, escreva o pedido no arquivo `*-REQUESTS.md` correspondente.

## Pull requests

- Uma mudança lógica por PR, com título em Conventional Commits.
- Preencha o template; ele pergunta como testar e se o contrato mudou.
- CI verde: os três jobs (`backend`, `frontend`, `smoke`) precisam passar.
- Não commite `node_modules/`, `dist/`, `.env` nem `*.db`.

## Reportando bugs

Use os templates de issue. Para bug, diga em qual modo você rodou (Docker ou
local), qual porta abriu, e — se for algo de sincronização — quantas abas
estavam abertas.
