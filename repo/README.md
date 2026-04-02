# Meridian Offline Commerce & Compliance Portal

A 100% offline, browser-based enterprise portal for internal auctions, controlled document management, and regulated communications. Built with React 19 + TypeScript + Vite + Tailwind CSS + IndexedDB (Dexie.js). No internet connection required at runtime.

---

## How to Run

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) ≥ 2.20 (bundled with Docker Desktop)

### One-Click Start (Production Preview)

```bash
docker compose up
```

That is the only command needed. Docker will:
1. Pull the `node:22-alpine` base image
2. Install all dependencies via `pnpm` (no local Node/pnpm required)
3. Build the static SPA with Vite
4. Serve it on port **4173**

### Development Mode (Hot-Reload)

```bash
docker compose --profile dev up dev
```

Source files are volume-mounted; Vite HMR updates the browser instantly on save.

### Stop All Services

```bash
docker compose down
```

---

## Services List

| Service | Profile | URL | Description |
|---|---|---|---|
| `app` | _(default)_ | http://localhost:4173 | Production preview build |
| `dev` | `dev` | http://localhost:5173 | Vite dev server with HMR |
| `test` | `test` | — | Vitest CI test runner |

---

## Verification

After `docker compose up`, verify the portal is running:

**Browser**
```
Open http://localhost:4173
```
You should see the Meridian Portal landing screen.

**curl / wget**
```bash
curl -I http://localhost:4173
# Expected: HTTP/1.1 200 OK
```

**Docker health check**
```bash
docker inspect --format='{{.State.Health.Status}}' meridian-app
# Expected: healthy  (after ~30 seconds)
```

**Compose status**
```bash
docker compose ps
# Expected: meridian-app  running  0.0.0.0:4173->4173/tcp
```

---

## Running Tests

### Using the CI script (recommended)

```bash
# Run all tests once
./run_tests.sh

# Run with coverage report
./run_tests.sh --coverage

# Clean rebuild before running
./run_tests.sh --clean

# Watch mode (development)
./run_tests.sh --watch
```

Coverage HTML report is written to `./coverage/index.html` on the host.

### Using Docker Compose directly

```bash
docker compose --profile test up --exit-code-from test test
```

### CI Pipeline Example

```yaml
# GitHub Actions
- name: Run tests
  run: ./run_tests.sh --coverage
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 19 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS 3 |
| Persistence | IndexedDB via Dexie.js 4 |
| Global State | Zustand 5 |
| Icons | Lucide React |
| Notifications | Sonner |
| Routing | React Router 7 |
| Testing | Vitest + Testing Library |
| Package Manager | pnpm |
| Container Runtime | Docker + Docker Compose |

---

## Project Structure

```
src/
├── crypto/       # PBKDF2 hashing, Web Crypto AES-GCM utilities
├── db/           # Dexie database schema and migrations
├── store/        # Zustand global state stores
├── types/        # TypeScript interfaces and enums
├── components/   # Reusable UI primitives
├── pages/        # Route-level page components
├── hooks/        # Custom React hooks
├── utils/        # Pure utility functions
└── test/         # Test setup and shared test utilities
```

---

## Default Credentials

On first launch, a default Administrator account is seeded automatically:

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `Admin@1234!` |

> **Change the default password immediately after first login.**
