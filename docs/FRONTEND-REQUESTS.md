# Solicitações para a sessão frontend

Escrito pela sessão **backend**. As duas sessões não conversam entre si — este arquivo é o canal. Quando você atender um item, marque o checkbox aqui mesmo.

## Estado atual

O backend está **pronto e verificado** (27/27 asserções em `backend/scripts/smoke.mjs`). Todo o contrato de `docs/API.md` está implementado e funcionando: REST completo, WebSocket broadcast, `position` fracionária.

Eu também deixei um **frontend baseline funcionando** em `frontend/` — React + TS + `98.css`, com board, listas, cards, drag-and-drop entre listas e sincronização via WebSocket. Ele builda limpo e roda no Docker. **Ele é seu a partir de agora**: a sessão backend não vai mais editar `frontend/`. Trate-o como ponto de partida, não como intocável — reescreva o que fizer sentido, desde que o contrato de `docs/API.md` continue respeitado.

## O que já está implementado no baseline

- `src/api.ts` — cliente REST + `positionFor(cards, index)`, o cálculo da posição fracionária
- `src/useBoard.ts` — carga inicial, conexão WS com reconexão em backoff, e o reducer de upsert idempotente
- `src/App.tsx` — board, listas como `.window`, cards, drag-and-drop HTML5, taskbar
- `src/styles.css` — só layout; bordas/botões/title bars vêm do `98.css`

## Pedidos

### Invariantes — não quebre estes

- [ ] **Eventos WS são upsert idempotente por `id`.** Quem faz a mutação recebe a resposta HTTP *e* o eco do broadcast. Aplicar o mesmo evento duas vezes tem que dar o mesmo resultado. Se você trocar o gerenciamento de estado, essa propriedade tem que sobreviver.
- [ ] **`position` é float, nunca índice inteiro.** O servidor só persiste o número que você mandar; quem calcula é o cliente, a partir dos vizinhos do destino. `positionFor()` já faz isso — reuse em vez de reimplementar.
- [ ] **Nada de proxy para a API.** O browser fala direto com `http://localhost:3001`. Não adicione proxy no `vite.config.ts` nem no `nginx.conf`: o CORS do backend já libera `:5173`, `:8080` e `:8090`, e proxiar o upgrade do WebSocket é a fonte número um de falha silenciosa aqui.
- [ ] **`VITE_API_URL` é build arg, não env de runtime.** O Vite injeta em build time. Se você mudar isso, ajuste também o `docker-compose.yml` (mas aí me avise, porque o compose é meu).

### Melhorias de visual e UX (o que eu deixei cru de propósito)

- [ ] **Trocar os `window.prompt`/`confirm` por diálogos Win95 de verdade.** Hoje criar lista, criar card, renomear e confirmar exclusão usam prompt nativo do browser — funciona, mas quebra completamente a estética. Cada um deveria ser uma `.window` modal com `.title-bar`, campo de texto e botões OK/Cancelar.
- [ ] **Edição inline do título do card.** Hoje é duplo-clique → `prompt`. Deveria virar um `<input>` no lugar do texto.
- [ ] **`description` do card não tem UI nenhuma.** O backend já persiste (`PATCH /api/cards/:id`), mas o baseline não expõe. Sugestão: duplo-clique abre uma janela de detalhe do card com título + descrição.
- [ ] **Reordenar listas.** `PATCH /api/lists/:id` aceita `position`, mas o baseline não tem drag de listas — só de cards.
- [ ] **Feedback de drop mais claro.** Hoje é uma borda azul de 3px no card de destino. Uma linha de inserção dedicada ficaria melhor.
- [ ] **Menu Iniciar funcional.** A taskbar é decorativa. Um menu com "Novo board", "Sobre..." fecharia o tema.
- [ ] **Ícone e wallpaper.** O desktop é teal chapado; um wallpaper e um ícone de "Meu Computador" ajudariam.

### Comportamento a validar

- [ ] Abrir a app em **duas abas** e confirmar que uma ação em uma aparece na outra sem refresh.
- [ ] Derrubar o backend (`docker compose stop backend`) e confirmar que a UI mostra "reconectando..." e volta sozinha quando o backend sobe.
- [ ] Arrastar um card **para o topo** e **para o fim** de uma lista, e para uma **lista vazia** — os três casos de borda do `positionFor`.

## Se você precisar de algo do backend

Escreva o pedido em `docs/BACKEND-REQUESTS.md` (crie o arquivo) e me avise pela sessão backend. Não edite `backend/` direto — mudança de contrato de um lado só é exatamente o que este arquivo existe para evitar.

---

## Nota de porta (backend, 2026-08-20)

A porta **8080 estava ocupada no host**, então o frontend em Docker foi publicado em **`:8090`** (`docker compose.yml`). O CORS do backend libera `5173`, `8080` e `8090`, então o dev server em `:5173` continua funcionando normalmente. A app roda em **http://localhost:8090**.
