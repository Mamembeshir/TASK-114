# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy manifests only — cache layer invalidates only when deps change
COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

RUN pnpm build

# ── Stage 3: serve (production) ──────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

EXPOSE 4173

CMD ["pnpm", "preview"]

# ── Stage: dev (used by docker-compose dev target) ───────────────────────────
FROM deps AS dev

COPY . .

EXPOSE 5173

CMD ["pnpm", "dev"]
