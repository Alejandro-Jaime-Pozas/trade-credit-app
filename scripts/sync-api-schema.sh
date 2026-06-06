#!/usr/bin/env bash
set -euo pipefail

docker compose exec -T backend \
  python manage.py spectacular --file schema.yaml --validate

docker compose exec -T frontend \
  npm run api:generate
