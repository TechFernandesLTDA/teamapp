# Vite injeta env vars em BUILD time -- VITE_API_URL tem que chegar como build arg,
# nao como variavel de runtime do container (ver CLAUDE.md).
FROM node:22-alpine AS build

ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app

# 98.css vem do npm, nao de CDN: o build roda offline depois deste passo.
COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
