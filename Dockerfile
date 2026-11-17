# «Тропы без барьеров»: образ без сторонних зависимостей — только Node.js и код проекта
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/app/data/tropy.db

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

# База хранится в томе /app/data; сервер работает не от root
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1

# Пароль администратора передайте при запуске: -e ADMIN_PASSWORD='…'
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
