#!/bin/sh
set -e

# migrate deploy roda aqui, nao no build: no build o volume /data ainda nao existe.
echo "aplicando migrations..."
npx prisma migrate deploy

# O seed e idempotente -- se o board default ja existe, nao faz nada.
echo "rodando seed..."
npx tsx prisma/seed.ts

echo "subindo a API em :3001..."
exec node dist/server.js
