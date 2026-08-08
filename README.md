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

Create a `.env` file in the repo root (it is git-ignored — never commit it).
Docker Compose loads it for the `backend` and `postgres-db` services.

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
docker compose up
```

This builds and starts three services and runs DB migrations automatically:

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

Run backend tests (pytest):

```bash
docker compose exec backend pytest
```

Run frontend tests (Vitest):

```bash
docker compose exec frontend npm test
```

Or, to run either suite as a one-off container that tears itself down afterward
(including the `postgres-db` dependency for the backend suite):

```bash
make pytest   # backend
make vitest   # frontend
make test     # both
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

- `/backend` — Django source (apps: `identity`, `customers`, `processing`,
  `storage`, `integrations`, `core`) and migrations.
- `/frontend` — Next.js (App Router) source.
- `/docs` — architecture, decisions, and version specs.
- `/ai` — agent contracts and workflow blueprints.
- `/logs` — prompt/plan/implementation logs.
