# Meridian Portal

An offline-first commerce and compliance portal for internal operations. Provides a unified workspace for administrators, content editors, reviewers, and participants to manage auctions, catalog items, publications, controlled documents, training courses, and notifications — all backed by browser-local IndexedDB storage, with role-based access control, an audit log, and a review/approval workflow.

## Architecture & Tech Stack

* **Frontend:** React 18, TypeScript, Vite, TailwindCSS, TipTap (rich text), Zustand (state)
* **Backend:** Not applicable — the app is a client-side SPA. All business logic runs in the browser.
* **Database:** IndexedDB (via Dexie) — browser-local persistence; no server-side database
* **Testing:** Vitest (unit/integration) + Playwright (E2E, Chromium)
* **Containerization:** Docker & Docker Compose (Required)

## Project Structure

```text
.
├── src/
│   ├── App.tsx / main.tsx   # Application entry & router
│   ├── auth/                # Auth store, password hashing, session management
│   ├── components/          # Shared UI components (TabBar, NavDrawer, Card, etc.)
│   ├── crypto/              # Argon2id password hashing utilities
│   ├── db/                  # Dexie schema, migrations, seed data
│   ├── hooks/               # Reusable React hooks
│   ├── pages/               # Feature pages (auctions, catalog, documents, …)
│   ├── services/            # Domain logic (auctionService, publicationService, …)
│   ├── store/               # Zustand stores (tabs, notifications, preferences)
│   ├── test/                # Unit, integration, and E2E test suites
│   │   └── e2e/             # Playwright E2E specs
│   ├── types/               # Shared TypeScript type definitions
│   └── utils/               # Cross-cutting helpers (date, format, etc.)
├── .env.example             # Example environment variables
├── Dockerfile               # Production image (multi-stage: dev / builder / runner)
├── Dockerfile.test          # Test runner image (Vitest + Playwright/Chromium)
├── docker-compose.yml       # Multi-profile orchestration (app / dev / test)
├── run_tests.sh             # Standardized test execution script
├── playwright.config.ts     # Playwright E2E configuration
├── vitest.config.ts         # Vitest unit/integration configuration
└── README.md                # Project documentation
```

## Prerequisites

To ensure a consistent environment, this project is designed to run entirely within containers. You must have the following installed:

* [Docker](https://docs.docker.com/get-docker/)
* [Docker Compose](https://docs.docker.com/compose/install/)

## Running the Application

1. **Copy the example environment file:**
   The repo ships with a sample env file. Duplicate it before starting the stack (the app reads build-time variables such as `VITE_SEED_DEMO`).
   ```bash
   cp .env.example .env
   ```

2. **Build and Start Containers:**
   Use Docker Compose to build the image and run the production preview server in detached mode.
   ```bash
   docker compose up --build -d
   ```

3. **Access the App:**
   * Frontend: `http://localhost:4173`

   > This application is a client-side SPA with no separate backend service or REST API — all persistence is handled in the browser via IndexedDB.

4. **Stop the Application:**
   ```bash
   docker compose down -v
   ```

### Optional — development mode with hot-reload

A dev profile runs the Vite dev server with live reload on port 5173:

```bash
docker compose --profile dev up
# → http://localhost:5173
```

## Testing

All unit, integration, and E2E tests are executed via a single, standardized shell script. This script automatically handles any necessary container orchestration for the test environment.

Make sure the script is executable, then run it:

```bash
chmod +x run_tests.sh
./run_tests.sh
```

Additional modes:

```bash
./run_tests.sh --unit       # Vitest only (fast — no Chromium install)
./run_tests.sh --e2e        # Playwright E2E only
./run_tests.sh --coverage   # Vitest with coverage report + Playwright
./run_tests.sh --clean      # Rebuild image + container from scratch
```

Artefacts are written back to the host:

* `./coverage/` — Vitest HTML coverage report
* `./playwright-report/` — Playwright HTML report
* `./test-results/` — Playwright traces / screenshots for failed runs

*Note: The `run_tests.sh` script outputs a standard exit code (`0` for success, non-zero for failure) to integrate smoothly with CI/CD validators.*

## Seeded Credentials

Three demo accounts are seeded into IndexedDB on first launch when the build is compiled with `VITE_SEED_DEMO=true` (the default for development and the included Docker image during testing). Use these credentials to verify authentication and role-based access controls.

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `adminPass1!@2` | Full access to every module (Users, Audit Log, System Settings, Data Import/Export, etc.). |
| **Content Editor** | `editor` | `editorPass1!@` | Can create and edit catalog items, publications, and documents. |
| **Reviewer / Approver** | `reviewer` | `reviewerPass1!` | Can approve or reject items submitted through the review workflow. |

> **First-launch bootstrap:** when no users exist (`VITE_SEED_DEMO=false` and a fresh IndexedDB), the app shows a **Bootstrap Admin** wizard instead of the login screen. Use it to create the initial Administrator account, after which normal login applies. Additional non-staff (Participant) accounts can be created via the self-registration form on the login screen.
