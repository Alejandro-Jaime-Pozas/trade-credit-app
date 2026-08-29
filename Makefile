.PHONY: test ci pytest vitest typecheck lint up down down-v cli worker-logs build build-nc makemigrations backend

# Run both test suites (backend pytest + frontend vitest).
test: pytest vitest

# Everything CI would gate on: tests plus static checks (typecheck + lint).
ci: pytest vitest typecheck lint

# Run the backend's pytest suite inside a one-off container, then tear
# down every container (including the postgres-db dependency) after.
pytest:
	docker compose run --rm backend pytest

# Run the frontend's vitest suite inside a one-off container. --no-deps
# skips starting backend/postgres-db: these tests mock fetch and never
# make a real HTTP call, so the dependency chain would just be dead weight.
vitest:
	docker compose run --rm --no-deps frontend npm test

# Typecheck the frontend (no build output, just type errors).
typecheck:
	docker compose run --rm --no-deps frontend npx tsc --noEmit

# Lint the frontend.
lint:
	docker compose run --rm --no-deps frontend npm run lint

# Bring up all services (backend, frontend, postgres-db) in the foreground;
# Ctrl+C stops them, then down cleans up containers/networks afterward.
up:
	docker compose up --abort-on-container-exit; docker compose down

down:
	docker compose down

# Same as down, but also removes named volumes (postgres-data, frontend-node-modules).
down-v:
	docker compose down -v

# Run just the backend and the services it depends on, instead of the whole stack.
# compose starts depends_on services automatically, so this is backend + postgres-db
# + redis — no frontend, no celery-worker.
# NOTE: without celery-worker, uploads still return 201 but nothing classifies them —
# the job sits in redis unconsumed. Use `make up` when you need classification to run.
backend:
	docker compose up backend

# Drop into a shell inside the backend container
cli:
	docker compose run --rm backend sh

# Follow the Celery worker's log. The worker is what actually classifies uploaded
# documents (see backend/storage/tasks.py) - `make up` already starts it, this is for
# watching a job run or diagnosing one that didn't.
worker-logs:
	docker compose logs -f celery-worker

# Generate Django migrations from model changes, inside a one-off backend
# container (tears down after, including the postgres-db dependency).
makemigrations:
	docker compose run --rm backend python manage.py makemigrations

# Rebuild all images: prune any orphaned containers.
build:
	docker compose down --remove-orphans
	docker compose build

# Rebuil all images from scratch: no cache, no orphaned containers.
build-nc:
	docker compose down --remove-orphans
	docker compose build --no-cache
