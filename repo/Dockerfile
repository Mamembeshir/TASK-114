# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-slim AS deps

# Install pnpm (pinned; avoids corepack downloading from registry at build time)
RUN npm install -g pnpm@10.23.0

WORKDIR /app

# Copy manifests + .npmrc (supportedArchitectures config)
COPY package.json pnpm-lock.yaml* .npmrc ./

# Install deps — no frozen-lockfile so pnpm resolves correct native binaries
# for the container platform (linux x64 glibc)
RUN pnpm install

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

RUN pnpm build

# ── Stage 3: serve (production) ──────────────────────────────────────────────
# Use a minimal static server — vite is a devDependency and not available
# after --prod install. `serve` handles SPA fallback via --single flag.
FROM node:20-slim AS runner

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
