/**
 * Guarda contra hook depois de return condicional.
 *
 * Este bug ja derrubou a app uma vez: um useMemo abaixo de `if (!board) return`
 * muda a quantidade de hooks entre a primeira renderizacao e a seguinte, o React
 * derruba a arvore inteira, e o sintoma e uma tela em branco com o bundle certo
 * sendo servido e nenhum erro no build. `tsc` nao pega, o Vite nao pega.
 *
 * Uso: node scripts/check-hooks.mjs   (sai 1 se achar violacao)
 *
 * E uma heuristica de texto, nao um parser: procura o primeiro `return` no nivel
 * de indentacao do corpo do componente e reclama de qualquer chamada de hook
 * depois dele. Prefere falso positivo a falso negativo -- se acusar algo
 * legitimo, o jeito e reorganizar o componente, que provavelmente esta grande
 * demais de qualquer forma.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const HOOK = /\buse[A-Z]\w*\s*\(/
// Um return de nivel 2 (dois espacos) dentro do componente: `  return (` ou
// `  if (x) return y`. Returns mais indentados estao dentro de callbacks.
const EARLY_RETURN = /^ {2}(if\s*\(.*\)\s*return\b|return\b)/
const COMPONENT = /^export (default )?function [A-Z]\w*/

let violations = 0

function check(file, source) {
  const lines = source.split('\n')
  let inComponent = false
  let sawReturn = null

  lines.forEach((line, i) => {
    if (COMPONENT.test(line)) {
      inComponent = true
      sawReturn = null
      return
    }
    if (!inComponent) return

    // Fim do componente: fecha-chaves na coluna 0.
    if (line === '}') {
      inComponent = false
      return
    }

    if (sawReturn === null && EARLY_RETURN.test(line)) {
      sawReturn = i + 1
      return
    }

    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return

    if (sawReturn !== null && HOOK.test(line)) {
      violations++
      console.log(
        `  ${file}:${i + 1}  hook depois do return da linha ${sawReturn}\n    ${trimmed.slice(0, 80)}`,
      )
    }
  })
}

const files = readdirSync(SRC).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
for (const f of files) check(f, readFileSync(join(SRC, f), 'utf8'))

if (violations > 0) {
  console.log(`\nFALHOU: ${violations} hook(s) depois de return condicional.`)
  console.log('Mova a chamada para junto dos outros hooks, antes de qualquer return.')
  process.exit(1)
}

console.log(`ok  ${files.length} arquivos, nenhum hook depois de return condicional`)
