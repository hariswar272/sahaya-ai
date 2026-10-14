# Multi-stage build: compile the PWA, then ship only the runtime server + built assets.
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npx vite build

FROM node:22-alpine AS server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production PORT=4200 HOST=0.0.0.0
WORKDIR /app
COPY --from=server /app/server /app/server
COPY --from=web /app/web/dist /app/web/dist
COPY server/ /app/server/
USER node
EXPOSE 4200
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4200/api/health || exit 1
CMD ["node", "server/index.mjs"]
