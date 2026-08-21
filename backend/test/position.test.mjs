// Testes unitarios da matematica de position fracionaria.
//
// Runner: node:test nativo (`node --test test/`). Zero dependencia extra.
//
// ATENCAO -- ESPELHO DE CONTRATO
// A funcao real vive no frontend, em `frontend/src/api.ts` (export positionFor),
// porque o calculo da nova position e responsabilidade do CLIENTE: so ele conhece
// os vizinhos do destino; o servidor apenas persiste o float recebido em
// `PATCH /api/cards/:id/move` (ver CLAUDE.md e docs/API.md).
//
// O backend nao pode importar do frontend (a fronteira de posse entre as duas
// sessoes proibe), entao a logica esta REPLICADA aqui como referencia executavel
// do contrato. Se `frontend/src/api.ts` mudar, este arquivo passa a mentir --
// atualize os dois juntos, ou o contrato divergiu e o codigo e que esta errado.

import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Espelho de `positionFor` em frontend/src/api.ts (linhas ~63-71).
 *
 * `siblings` sao os cards ja ordenados da lista de DESTINO (sem o card que esta
 * sendo arrastado) e `index` e o slot onde ele vai cair.
 */
function positionFor(siblings, index) {
  const before = siblings[index - 1]
  const after = siblings[index]

  if (!before && !after) return 0
  if (!before) return after.position - 1
  if (!after) return before.position + 1
  return (before.position + after.position) / 2
}

const at = (...positions) => positions.map((position, i) => ({ id: `c${i}`, position }))

test('lista vazia: primeira position e 0', () => {
  assert.equal(positionFor([], 0), 0)
})

test('topo: first.position - 1', () => {
  assert.equal(positionFor(at(1, 2, 3), 0), 0)
  assert.equal(positionFor(at(-5.5, 2), 0), -6.5)
  // Nao ha piso: arrastar pro topo repetidamente so caminha para -Infinity.
  assert.equal(positionFor(at(0), 0), -1)
})

test('fim: last.position + 1', () => {
  assert.equal(positionFor(at(1, 2, 3), 3), 4)
  // "ultima + 1" sobre o valor fracionario, igual ao POST do servidor:
  // depois de um card em 7.125 o proximo nasce em 8.125 (docs/API.md).
  assert.equal(positionFor(at(7.125), 1), 8.125)
})

test('meio: (a + b) / 2', () => {
  assert.equal(positionFor(at(1, 2, 3), 1), 1.5)
  assert.equal(positionFor(at(1, 2, 3), 2), 2.5)
  assert.equal(positionFor(at(0, 1), 1), 0.5)
  assert.equal(positionFor(at(1, 1.5), 1), 1.25)
  // Vizinhos negativos e assimetricos continuam valendo.
  assert.equal(positionFor(at(-4, 6), 1), 1)
})

test('um unico drag grava uma unica linha: os vizinhos nao mudam', () => {
  const siblings = at(1, 2, 3)
  const snapshot = JSON.stringify(siblings)
  positionFor(siblings, 1)
  assert.equal(JSON.stringify(siblings), snapshot, 'positionFor nao pode mutar os vizinhos')
})

test('a position nova cai estritamente entre os vizinhos (ordenacao preservada)', () => {
  const siblings = at(2, 4, 8)
  for (let index = 0; index <= siblings.length; index++) {
    const p = positionFor(siblings, index)
    const before = siblings[index - 1]
    const after = siblings[index]
    if (before) assert.ok(p > before.position, `${p} deveria ser > ${before.position}`)
    if (after) assert.ok(p < after.position, `${p} deveria ser < ${after.position}`)
  }
})

// --- Limite conhecido: ~53 divisoes pela metade -------------------------------
// docs/API.md, "Limite conhecido da position fracionaria": entre dois inteiros
// vizinhos cabem ~53 divisoes pela metade antes de o double esgotar a precisao e
// os valores empatarem. Nao ha rebalanceamento -- o teste documenta o teto, nao
// pede conserto.
test('halving repetido no mesmo ponto empata em ~53 divisoes', () => {
  const lo = 1
  let hi = 2
  let divisions = 0

  // Sempre soltando no MESMO ponto -- logo depois de `lo` -- que e o pior caso
  // real: o card novo vira o vizinho de cima da proxima insercao.
  for (;;) {
    const mid = positionFor(at(lo, hi), 1)
    if (mid === lo || mid === hi) break // empatou: a precisao acabou
    hi = mid
    divisions++
    if (divisions > 200) assert.fail('nao empatou -- a matematica mudou?')
  }

  // 52 divisoes uteis; a 53a arredonda de volta para `lo`. O ulp de 1.0 e 2^-52.
  assert.equal(divisions, 52)
  assert.equal(hi, 1 + Number.EPSILON, 'o ultimo valor util e o vizinho imediato de 1.0')
  assert.equal(positionFor(at(lo, hi), 1), lo, 'a divisao seguinte empata com o vizinho de baixo')
  assert.ok(divisions <= 53, 'docs/API.md promete ~53 -- se subir, o doc mente')
})

test('empate de position e resolvido por id, nao por position', () => {
  // Quando o teto acima e atingido dois cards ficam com a MESMA position. O
  // servidor usa orderBy: [{position}, {id}] justamente para isso (docs/API.md).
  const tied = [
    { id: 'b', position: 1.5 },
    { id: 'a', position: 1.5 },
  ]
  const ordered = [...tied].sort((x, y) => x.position - y.position || x.id.localeCompare(y.id))
  assert.deepEqual(
    ordered.map((c) => c.id),
    ['a', 'b'],
    'com position empatada a ordem tem que ser determinista pelo id',
  )
})
