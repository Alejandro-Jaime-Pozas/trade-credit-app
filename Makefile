.PHONY: test ci pytest vitest typecheck lint up down down-v cli build build-nc

# Run both test suites (backend pytest + frontend vitest).
test: pytest vitest

# Everything CI would gate on: tests plus static checks (typecheck + lint).
ci: pytest vitest typecheck lint

# Run the backend's pytest suite inside a one-off container, then tear
# down every container (including the postgres-db dependency) after.
pytest:
	docker compose run --rm backend pytest; docker compose down

# Run the frontend's vitest suite inside a one-off container. --no-deps
# skips starting backend/postgres-db: these tests mock fetch and never
# make a real HTTP call, so the dependency chain would just be dead weight.
vitest:
	docker compose run --rm --no-deps frontend npm test; docker compose down

# Typecheck the frontend (no build output, just type errors).
typecheck:
	docker compose run --rm --no-deps frontend npx tsc --noEmit; docker compose down

# Lint the frontend.
lint:
	docker compose run --rm --no-deps frontend npm run lint; docker compose down

# Bring up all services (backend, frontend, postgres-db) in the foreground;
# Ctrl+C stops them, then down cleans up containers/networks afterward.
up:
	docker compose up --abort-on-container-exit; docker compose down

down:
	docker compose down

# Same as down, but also removes named volumes (postgres-data, frontend-node-modules).
down-v:
	docker compose down -v

# Drop into a shell inside the backend container, then tear everything down on exit.
cli:
	docker compose run --rm backend sh; docker compose down

# Rebuild all images: prune any orphaned containers.
build:
	docker compose down --remove-orphans
	docker compose build

# Rebuil all images from scratch: no cache, no orphaned containers.
build-nc:
	docker compose down --remove-orphans
	docker compose build --no-cache
