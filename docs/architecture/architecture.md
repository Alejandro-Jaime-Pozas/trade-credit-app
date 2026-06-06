# Trade Credit Automation Application for Mexican Companies

## Tech Stack

### Core Application

-   Frontend:
    -   Next.js (App Router)
    -   Typescript
    -   Tailwind CSS
    -   shadcn/ui
    -   TanStack Query (if needed)
    -   Native React State (avoid Redux unless truly needed)
    -   React Hook Form
    -   Zod
    -   Auth & API:
        -   JWT (from DRF backend)
        -   Fetch via:
            -   native `fetch` OR
            -   lightweight wrapper (don't over-engineer)
    -   Testing (if needed):
        -   Vitest
        -   React Testing Library
        -   Playwright
-   Backend:
    -   Django REST Framework
-   Database: Postgres
-   Containerization: Docker

### Infrastructure & Background Processing

-   Cache & Broker: Redis
-   Async Tasks: Celery
-   Background Scheduling: Celery Beat

### Authentication & Authorization

-   Authentication: django auth + JWT (Simple JWT)
-   Rate Limiting: DRF Throttling / django-ratelimit

### API & Documentation

-   API Documentation: drf-spectacular (OpenAPI)
-   Contract sync: `backend/schema.yaml` (exported via Spectacular) drives `frontend/src/lib/api.generated.ts` (`openapi-typescript`). Run `./scripts/sync-api-schema.sh` locally; pushes to `main` that change `backend/**` (except `schema.yaml` alone) auto-sync via GitHub Actions.

### Testing & Code Quality

-   Testing: pytest + pytest-django
-   Factories: factory_boy
-   Coverage: coverage.py
-   Linting (Python): ruff + black + isort
-   Linting (Frontend): ESLint + Prettier

### Observability & Monitoring

-   Error Tracking: Sentry (free tier)
-   Structured Logging: structlog
-   Metrics (optional): Prometheus + Grafana

### CI/CD

-   GitHub Actions (free tier)

## Directory Structure

-   `/ai`: contains agent contracts and workflow blueprints.
-   `/docs`: contains project documentation and feature specs.
-   `/backend`: contains the Django source code and migrations.
-   `/frontend`: contains the Next.js source code.
-   `/logs`: contains logs and prompts for debugging and tracking.
