/**
 * Serializa operacoes por chave.
 *
 * Existe por causa de um bug real: `POST /api/cards` lia a maior `position` da
 * lista e so depois inseria `last.position + 1`. Duas criacoes simultaneas leem
 * a mesma "ultima" e nascem empatadas -- 15 requisicoes em paralelo produziam 5
 * posicoes distintas.
 *
 * O empate nao e cosmetico. A partir de dois cards na mesma position,
 * `positionFor()` calcula `(a + b) / 2 === a` para o slot entre eles: o servidor
 * responde 200, grava o valor que recebeu, e o card **nao sai do lugar**. O
 * desempate por `id` no `orderBy` mantem a ordem estavel, entao nada parece
 * quebrado -- o drag simplesmente nao funciona.
 *
 * Uma transacao do Prisma nao resolve sozinha: no SQLite o `BEGIN` e deferido, o
 * SELECT nao pega lock de escrita, e as duas transacoes leem o mesmo valor antes
 * de qualquer uma escrever.
 *
 * LIMITE: isto e um mutex em memoria, valido enquanto houver **um processo** de
 * backend -- que e o modelo de implantacao aqui (um container no compose). Com
 * mais de uma instancia o race volta, e a correcao passa a ser no banco:
 * `INSERT ... SELECT MAX(position) + 1` numa unica declaracao, ou
 * `UNIQUE(listId, position)` com retry.
 */

const chains = new Map<string, Promise<unknown>>()

export function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve()

  // `previous.then(task, task)` roda a tarefa tenha a anterior falhado ou nao:
  // um erro numa requisicao nao pode travar a fila das seguintes.
  const next = previous.then(task, task)

  // O que fica no Map e a versao "silenciada": se ninguem tratar a rejeicao da
  // corrente armazenada, o Node emite unhandledRejection.
  const settled = next.then(
    () => undefined,
    () => undefined,
  )
  chains.set(key, settled)

  // Libera a entrada quando esta e a ultima tarefa da chave -- sem isso o Map
  // cresce indefinidamente conforme listas sao criadas e apagadas.
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key)
  })

  return next
}
