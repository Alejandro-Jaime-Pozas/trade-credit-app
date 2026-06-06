#!/usr/bin/env bash
# Regenerate backend OpenAPI schema and frontend TypeScript types.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="${ROOT}/backend"
FRONTEND="${ROOT}/frontend"

export POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export POSTGRES_DB="${POSTGRES_DB:-trade_credit_app_db}"
export POSTGRES_USER="${POSTGRES_USER:-trade_credit_app_user}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
export SECRET_KEY="${SECRET_KEY:-schema-export-only-not-for-production}"

cd "${BACKEND}"
python manage.py spectacular --file schema.yaml --validate

cd "${FRONTEND}"
npm run api:generate
