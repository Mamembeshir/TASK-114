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

## Option B — Local development (Node.js 20+)

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (hot-reload, http://localhost:5173)
npm run dev

# 3. Run the test suite
npm test

# 4. Build for production (output: dist/)
npm run build
```

> **Node version:** 20 or later is required. Use [nvm](https://github.com/nvm-sh/nvm) or
> [fnm](https://github.com/Schniz/fnm) to manage Node versions if needed.

## Seeded Accounts

The following accounts are available on first launch. Use them to log in and explore the portal with different permission levels.

| Username   | Password         | Role                |
| ---------- | ---------------- | ------------------- |
| `admin`    | `adminPass1!`    | Administrator       |
| `editor`   | `editorPass1!`   | Content Editor      |
| `reviewer` | `reviewerPass1!` | Reviewer / Approver |

> Buyer accounts can be created via the self-registration form on the login screen.
