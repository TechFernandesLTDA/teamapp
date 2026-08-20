# node:24-slim (Debian), nao Alpine: o Prisma em musl exige binaryTargets extras
# e openssl instalado a mao -- Debian-slim evita o problema inteiro.
FROM node:24-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc


FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# O arquivo SQLite mora num volume nomeado, nunca num bind mount do Windows:
# o file locking do SQLite sobre bind mount do Docker Desktop falha de forma intermitente.
ENV DATABASE_URL="file:/data/dev.db"
RUN mkdir -p /data

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
