# Meridian Portal

## Startup

Run the following command from the project root. Docker will build and serve the app automatically — no local Node.js or pnpm required.

```bash
docker compose up
```

## Access

Once the container is running, open the portal in your browser:

```
http://localhost:4173
```

## Verification

Confirm the app is serving correctly:

```bash
curl -I http://localhost:4173
```

Expected response: `HTTP/1.1 200 OK`

## Seeded Accounts

The following accounts are available on first launch. Use them to log in and explore the portal with different permission levels.

| Username   | Password         | Role                |
| ---------- | ---------------- | ------------------- |
| `admin`    | `adminPass1!`    | Administrator       |
| `editor`   | `editorPass1!`   | Content Editor      |
| `reviewer` | `reviewerPass1!` | Reviewer / Approver |

> Buyer accounts can be created via the self-registration form on the login screen.
