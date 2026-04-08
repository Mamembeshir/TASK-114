# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

# Install pnpm (pinned; avoids corepack downloading from registry at build time)
RUN npm install -g pnpm@10.23.0

WORKDIR /app

# Copy manifests + .npmrc (contains supportedArchitectures for musl/linux)
COPY package.json pnpm-lock.yaml* .npmrc ./

RUN pnpm install --frozen-lockfile

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

RUN pnpm build

# ── Stage 3: serve (production) ──────────────────────────────────────────────
# Use a minimal static server — vite is a devDependency and not available
# after --prod install. `serve` handles SPA fallback via --single flag.
FROM node:22-alpine AS runner

RUN npm install -g serve@14

WORKDIR /app

COPY --from=builder /app/dist ./dist

EXPOSE 4173

CMD ["serve", "--single", "--listen", "4173", "dist"]

# ── Stage: dev (used by docker-compose dev target) ───────────────────────────
FROM deps AS dev

COPY . .

EXPOSE 5173

CMD ["pnpm", "dev"]
