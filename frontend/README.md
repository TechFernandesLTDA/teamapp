# frontend

React + TypeScript + Vite, visual pelo pacote npm `98.css`, drag-and-drop HTML5 nativo.
O contrato da API esta em `../docs/API.md` — se o codigo divergir de la, o codigo esta errado.

```bash
npm install
npm run dev      # :5173, chama a API em :3001
npm run build    # tsc + vite build -> dist/
```

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types.ts` | espelho dos modelos de `docs/API.md` |
| `src/api.ts` | wrappers tipados dos 8 endpoints + `positionFor()` (a matematica do drag) |
| `src/useBoard.ts` | `GET /api/board`, WebSocket com backoff, e o reducer de eventos |
| `src/App.tsx` | board, header, taskbar, estado do drag |
| `src/ListColumn.tsx` | uma lista (`.window`), seus cards e os alvos de drop |
| `src/CardDialog.tsx` | edicao de titulo/descricao do card |
| `src/styles.css` | so layout — bordas e botoes vem do `98.css` |

## O que o backend precisa saber (para o `docker-compose.yml`)

O compose ja existe e ja esta correto. Para referencia, o que o servico do frontend precisa:

```yaml
frontend:
  build:
    context: ./frontend
    args:
      VITE_API_URL: http://localhost:3001   # build arg, NAO environment
  ports:
    - "8090:80"                             # nginx escuta na 80 dentro do container
  depends_on:
    - backend
```

`VITE_API_URL` como `environment:` nao funciona — o Vite resolve a variavel em build
time e o bundle sai com o default embutido.

O valor tem que ser a URL que o **browser** usa (`http://localhost:3001`), nunca
`http://backend:3001`: quem faz a chamada e a maquina do usuario, nao o container.

O nginx daqui nao proxia `/api` nem `/ws` — o browser fala direto com a API.
