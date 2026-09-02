.PHONY: test ci pytest vitest typecheck lint up down down-v cli worker-logs build build-nc makemigrations backend ui-start ui-stop ui-publish ui-clean ui-status ui-logs

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


# ---------------------------------------------------------------------------
# Parallel UI work: a second frontend, out of a git worktree, on :3001.
#
# WHY: docker-compose.yml runs one frontend container bind-mounting ./frontend with
# `next dev`, so every saved file hot-reloads into whatever browser is pointed at :3000.
# That makes the app unusable while its UI is being edited. These targets put the
# in-progress UI in a separate working tree on a separate port, leaving :3000 stable
# until the work is deliberately merged.
#
# A worktree only ever sees COMMITTED state, which is why ui-start refuses to branch
# from a dirty tree - otherwise the branch would silently be missing your local edits.
# ---------------------------------------------------------------------------

# Where the second working tree lives, and what branch it is on. Override either:
#   make ui-start UI_BRANCH=ui/labels-page
UI_WORKTREE ?= ../trade_credit_app-ui
UI_BRANCH   ?= ui/work
UI_PROJECT  ?= tca-ui
UI_COMPOSE   = docker compose -f docker-compose.preview.yml -p $(UI_PROJECT)

# Create the worktree (if it is not there yet) and start the preview server on :3001.
# The main stack is NOT started here - run `make up` for that, since the preview has no
# backend of its own and talks to the one on :8000.
ui-start:
	@git diff --quiet && git diff --cached --quiet || { \
		echo "ERROR: main tree has uncommitted changes."; \
		echo "A worktree branches from committed state only, so those edits would be"; \
		echo "missing from it. Commit or stash first."; \
		exit 1; }
	@test -d $(UI_WORKTREE) || git worktree add -B $(UI_BRANCH) $(UI_WORKTREE)
	@cd $(UI_WORKTREE) && $(UI_COMPOSE) up -d
	@echo ""
	@echo "  preview  http://localhost:3001   (worktree: $(UI_WORKTREE), branch: $(UI_BRANCH))"
	@echo "  stable   http://localhost:3000   (this tree - start it with 'make up')"
	@echo ""
	@echo "  First run installs node_modules; give it a minute. Logs: make ui-logs"

# Stop the preview server. Leaves the worktree and its branch alone.
ui-stop:
	@cd $(UI_WORKTREE) 2>/dev/null && $(UI_COMPOSE) down || $(UI_COMPOSE) down

ui-logs:
	@cd $(UI_WORKTREE) && $(UI_COMPOSE) logs -f frontend-preview

# What is running where.
ui-status:
	@git worktree list
	@echo ""
	@$(UI_COMPOSE) ps

# "Publish": merge the finished UI branch into this tree, so :3000 picks it up.
# Run from the main tree. git refuses the merge if it would clobber uncommitted work
# here, which is the behaviour we want - fix the tree, do not force it.
ui-publish:
	@git -C $(UI_WORKTREE) diff --quiet && git -C $(UI_WORKTREE) diff --cached --quiet || { \
		echo "ERROR: $(UI_WORKTREE) has uncommitted changes. Commit them on $(UI_BRANCH) first."; \
		exit 1; }
	git merge --no-ff $(UI_BRANCH)

# Remove the worktree once the branch is merged and the preview is stopped.
# No --force on purpose: git refuses if the worktree still holds uncommitted work,
# and that refusal is a feature, not an obstacle to work around.
ui-clean: ui-stop
	git worktree remove $(UI_WORKTREE)
