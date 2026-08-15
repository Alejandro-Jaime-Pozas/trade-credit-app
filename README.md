# Trade Credit App

AI-assisted trade-credit (net 30/60) approval app for Mexican companies.
Django REST Framework + Postgres backend, Next.js frontend, OpenAI for
document classification/extraction. Everything runs via Docker Compose.

## Requirements

- Docker + Docker Compose (the only hard dependency to run the app)
- An OpenAI API key (for the document classification/extraction feature)
- Node.js 20+ — only if you want to run the API type-sync watcher locally
  (see below); it is not needed just to launch the app.

## 1. Create the `.env` file

Copy `.env.example` to `.env` in the repo root (it is git-ignored — never
commit it) and fill in the values. Docker Compose loads it for the `backend`
and `postgres-db` services.

```bash
cp .env.example .env
```

```env
# DJANGO
DEBUG=True

# POSTGRES
POSTGRES_DB=trade_credit_app_db
POSTGRES_USER=trade_credit_app_user
POSTGRES_PASSWORD=changeme
POSTGRES_HOST=postgres-db      # must be the compose service name, not localhost
POSTGRES_PORT=5432

# OPENAI
OPENAI_API_KEY=sk-...          # required for AI document extraction
```

Note: `POSTGRES_HOST` must be `postgres-db` (the Compose service name) so the
backend container can reach the database. `localhost` only works when running
the backend outside Docker.

## 2. Launch the app

```bash
make up
# or: docker compose up
```

`make up` runs in the foreground (Ctrl+C stops it) and cleans up containers
afterward; plain `docker compose up` works the same way but skips that
cleanup step. This builds and starts three services and runs DB migrations
automatically:

| Service       | URL                              | Notes                          |
| ------------- | -------------------------------- | ------------------------------ |
| Frontend      | http://localhost:3000            | Next.js app                    |
| Backend API   | http://localhost:8000/api/v1     | Django REST Framework          |
| Django admin  | http://localhost:8000/admin      | needs a superuser (see below)  |
| Postgres      | localhost:5432                   | data persists in a volume      |

Then open http://localhost:3000 and sign up to create your first user and
organization.

## 3. Common tasks

Create a Django admin superuser:

```bash
docker compose exec backend python manage.py createsuperuser
```

Run migrations manually (normally automatic on `up`):

```bash
docker compose exec backend python manage.py migrate
```

### Makefile shortcuts

The Makefile wraps the common Docker Compose commands below. Test targets run
in a one-off container that tears itself down afterward (including the
`postgres-db` dependency for the backend suite), so they don't require the
app to already be running.

| Command          | What it does                                                            |
| ---------------- | ------------------------------------------------------------------------ |
| `make up`        | Start all services in the foreground; cleans up on Ctrl+C                |
| `make down`      | Stop all services                                                        |
| `make down-v`    | Stop all services and remove named volumes (Postgres data, node_modules) |
| `make build`     | Rebuild all images, pruning orphaned containers                          |
| `make build-nc`  | Rebuild all images from scratch, no cache                                |
| `make cli`       | Drop into a shell inside the `backend` container                        |
| `make pytest`    | Run the backend test suite                                               |
| `make vitest`    | Run the frontend test suite                                              |
| `make typecheck` | Typecheck the frontend (`tsc --noEmit`, no build output)                 |
| `make lint`      | Lint the frontend                                                        |
| `make test`      | `pytest` + `vitest`                                                      |
| `make ci`        | Everything CI gates on: `test` + `typecheck` + `lint`                    |

Equivalent one-off `docker compose` invocations, if you'd rather not use the
Makefile:

```bash
docker compose exec backend pytest        # backend tests (needs the app running)
docker compose exec frontend npm test     # frontend tests (needs the app running)
```

## API type sync (frontend types)

The backend's OpenAPI schema (`backend/schema.yaml`) drives the generated
frontend types (`frontend/src/lib/api.generated.ts`). To auto-regenerate them
whenever backend code changes, run in a second terminal (requires Node +
[watchexec](https://github.com/watchexec/watchexec)):

```bash
cd frontend && npm run watch-api
```

To regenerate once, on demand:

```bash
./scripts/sync-api-schema.sh
```

## Project layout

- `/backend` — Django source and migrations.
  - `app/` — the Django project module (settings, urls, asgi/wsgi) — not a
    Django app itself.
  - `identity`, `customers`, `processing`, `storage`, `integrations` — the
    Django apps implementing the domain.
  - `core` — shared, cross-app code: the `OrganizationScopedMixin` used to
    enforce multi-tenant scoping, the file-type catalog, validators, and
    other utilities with no single owning app.
- `/frontend` — Next.js (App Router) source.
- `/docs` — architecture, decisions, bug fixes, and version specs.
- `/ai` — agent contracts, execution context, and workflow blueprints.
- `/logs` — prompt/plan/implementation logs.
