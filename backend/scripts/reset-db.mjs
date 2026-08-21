#!/usr/bin/env node
// Reset destrutivo do banco de DESENVOLVIMENTO local.
//
//   node scripts/reset-db.mjs          # dry-run: mostra o que faria e sai 0
//   node scripts/reset-db.mjs --yes    # executa de verdade
//
// O que faz, nessa ordem:
//   1. apaga o arquivo SQLite apontado por DATABASE_URL (e os -journal/-wal/-shm)
//   2. `npx prisma migrate deploy`  -- recria o schema a partir de prisma/migrations
//   3. `npm run seed`               -- recria o board default
//
// Sem dependencia nova: so node:fs, node:path, node:child_process.
//
// Nao serve para o container: la o banco vive no volume nomeado (/data/dev.db) e
// o reset e `docker compose down -v`. O script recusa caminhos fora de backend/
// justamente para nao apagar o banco errado por acidente.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PRISMA_DIR = join(BACKEND_DIR, 'prisma')
const CONFIRM_FLAG = '--yes'

const confirmed = process.argv.slice(2).includes(CONFIRM_FLAG)

/** DATABASE_URL do ambiente, com fallback no backend/.env (o Prisma faz igual). */
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const envFile = join(BACKEND_DIR, '.env')
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = /^\s*DATABASE_URL\s*=\s*(.*)$/.exec(line)
      if (match) return match[1].trim().replace(/^["']|["']$/g, '')
    }
  }
  return null
}

/**
 * `file:./dev.db` -> caminho absoluto. Caminho relativo no Prisma e resolvido a
 * partir do diretorio do schema (backend/prisma/), nao do cwd.
 */
function sqlitePath(url) {
  if (!url.startsWith('file:')) return null
  const raw = url.slice('file:'.length)
  return resolve(PRISMA_DIR, raw)
}

function fail(message) {
  console.error(`reset-db: ${message}`)
  process.exit(1)
}

const url = databaseUrl()
if (!url) fail('DATABASE_URL nao definida (nem no ambiente, nem em backend/.env). Copie .env.example.')

const dbFile = sqlitePath(url)
if (!dbFile) fail(`DATABASE_URL="${url}" nao e uma URL file: -- este script so mexe em SQLite local.`)

// Trava de seguranca: so apaga dentro de backend/. `/data/dev.db` do container cai aqui.
const inside = relative(BACKEND_DIR, dbFile)
if (inside.startsWith('..') || resolve(dbFile) === resolve(BACKEND_DIR)) {
  fail(
    `recusando apagar "${dbFile}": esta fora de ${BACKEND_DIR}.\n` +
      '        Se e o banco do container, o reset e `docker compose down -v`.',
  )
}

const sidecars = ['-journal', '-wal', '-shm'].map((suffix) => dbFile + suffix)
const targets = [dbFile, ...sidecars].filter((file) => existsSync(file))

const size = existsSync(dbFile) ? `${statSync(dbFile).size} bytes` : 'nao existe ainda'
const steps = [
  targets.length ? `apagar: ${targets.join(', ')}` : 'nada para apagar (banco ausente)',
  'npx prisma migrate deploy',
  'npm run seed',
]

console.log('')
console.log('  *** DESTRUTIVO: apaga TODO o conteudo do banco local. Nao da para desfazer. ***')
console.log('')
console.log(`  DATABASE_URL : ${url}`)
console.log(`  arquivo      : ${dbFile} (${size})`)
console.log('')
steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`))
console.log('')

if (!confirmed) {
  console.log(`  Dry-run: nada foi tocado. Rode com ${CONFIRM_FLAG} para executar de verdade.`)
  console.log('')
  process.exit(0)
}

// `execSync` (linha de comando unica) e nao `execFileSync`: no Windows npx/npm
// sao .cmd, que o Node so executa atraves do shell -- e passar `args` junto com
// `shell: true` dispara DEP0190. Os comandos aqui sao literais fixos, sem
// interpolacao de entrada externa.
function run(commandLine) {
  console.log(`  $ ${commandLine}`)
  execSync(commandLine, {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  })
}

try {
  for (const file of targets) {
    rmSync(file, { force: true })
    console.log(`  removido ${file}`)
  }

  // `migrate deploy` (nao `migrate dev`): aplica as migrations existentes sem
  // tentar gerar uma nova nem abrir prompt -- e o que um script nao-interativo quer.
  run('npx prisma migrate deploy')
  run('npm run seed')
} catch (err) {
  fail(`falhou: ${err.message}`)
}

console.log('')
console.log('  Banco recriado e semeado.')
console.log('')
