# =========================
# Dependencies
# =========================
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci


# =========================
# Build
# =========================
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm run build


# =========================
# Test
# =========================
FROM node:22-alpine AS test

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests

RUN npm test


# =========================
# Production
# =========================
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data && \
    chown -R appuser:appgroup /app

USER appuser

CMD ["node", "dist/index.js"]