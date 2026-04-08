# Meridian Portal

## Option A — Docker (no local toolchain required)

Run the following command from the project root. Docker will build and serve the app automatically — no local Node.js or npm required.

```bash
docker compose up
```

Once the container is running, open the portal in your browser:

```
http://localhost:4173
```

Confirm the app is serving correctly:

```bash
curl -I http://localhost:4173
```

Expected response: `HTTP/1.1 200 OK`

## Option B — Local development (Node.js 20+ / pnpm 10+)

This project is managed with **pnpm**. Install it via `npm install -g pnpm` or `corepack enable` if you don't have it already.

```bash
# 1. Install dependencies
pnpm install

# 2. Start the dev server (hot-reload, http://localhost:5173)
pnpm dev

# 3. Run the test suite
pnpm test

# 4. Build for production (output: dist/)
pnpm build
```

> **Node version:** 20 or later is required. Use [nvm](https://github.com/nvm-sh/nvm) or
> [fnm](https://github.com/Schniz/fnm) to manage Node versions if needed.

## Seeded Accounts

Demo accounts are seeded **only in development mode** (`pnpm dev`) or when a production build is created with `VITE_SEED_DEMO=true`. They are **not** present in a standard production build (e.g. the Docker image).

| Username   | Password          | Role                |
| ---------- | ----------------- | ------------------- |
| `admin`    | `adminPass1!@2`   | Administrator       |
| `editor`   | `editorPass1!@`   | Content Editor      |
| `reviewer` | `reviewerPass1!`  | Reviewer / Approver |

**Production / Docker first launch:** when no users exist (no demo seed, fresh install), the app shows a **Bootstrap Admin** wizard instead of the login screen. Use it to create the initial Administrator account, after which normal login applies.

> Buyer accounts can be created via the self-registration form on the login screen.
