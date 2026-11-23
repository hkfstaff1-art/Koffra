#!/usr/bin/env bash
# Test de bout en bout réel (DÉVELOPPEMENT UNIQUEMENT : la base `koffra` est réinitialisée !).
# Prérequis : backend/.env configuré (MySQL), MAIL_MAILER=log + MAIL_LOG_CHANNEL=maildev.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${KOFFRA_E2E_PORT:-8000}"

cd "$ROOT/backend"
if grep -q '^APP_ENV=production' .env; then echo "Refusé : APP_ENV=production" >&2; exit 1; fi

php artisan migrate:fresh --force >/dev/null
rm -f storage/logs/mail-dev.log
TOKEN="$(php artisan koffra:install | grep -o 'installation#[A-Za-z0-9_-]*' | cut -d'#' -f2)"

php artisan serve --port="$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; (cd "$ROOT/backend" && php artisan migrate:fresh --force >/dev/null)' EXIT
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/up" >/dev/null && break; sleep 1; done

cd "$ROOT/frontend"
KOFFRA_E2E_URL="http://127.0.0.1:$PORT" KOFFRA_E2E_TOKEN="$TOKEN" KOFFRA_E2E_MAILLOG="$ROOT/backend/storage/logs/mail-dev.log" \
  npx vitest run --config vitest.e2e.config.ts
