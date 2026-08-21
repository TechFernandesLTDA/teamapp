## O que muda

<!-- Uma ou duas frases. Se fecha uma issue: "Fecha #123". -->

## Por quê

<!-- O problema que isto resolve. -->

## Como testar

<!-- Passos exatos. Ex.: docker compose up --build, abrir :8090 em duas abas,
     arrastar um card da primeira lista para a segunda. -->

## O contrato mudou?

- [ ] Não
- [ ] Sim — e atualizei `CLAUDE.md` **e** `docs/API.md` neste mesmo PR

<!-- Conta como contrato: payload, status code, evento de WebSocket, semântica
     de `position`, portas/origens de CORS, ou quem é dono de qual diretório. -->

## Checklist

- [ ] Título em Conventional Commits (`feat(frontend): ...`)
- [ ] `npx tsc --noEmit` no backend e `npm run build` no frontend passam
- [ ] `node backend/scripts/smoke.mjs` passa contra o stack de pé
- [ ] Não editei o diretório da outra sessão (`backend/` vs `frontend/`)
- [ ] Sem `node_modules/`, `dist/`, `.env` ou `*.db` no diff
