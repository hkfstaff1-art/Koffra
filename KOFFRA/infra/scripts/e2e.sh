#!/usr/bin/env bash
# Test de bout en bout réel (DÉVELOPPEMENT UNIQUEMENT : la base `koffra` est réinitialisée !).
# Prérequis : backend/.env configuré (MySQL), MAIL_MAILER=log + MAIL_LOG_CHANNEL=maildev.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${KOFFRA_E2E_PORT:-8000}"

cd "$ROOT/backend"
if grep -q '^APP_ENV=production' .env; then echo "Refusé : APP_ENV=production" >&2; exit 1; fi

php artisan migrate:fresh --force >/dev/null
rm -rf storage/logs/mail-dev.log storage/app/private/attachments
TOKEN="$(php artisan koffra:install | grep -o 'installation#[A-Za-z0-9_-]*' | cut -d'#' -f2)"

# Emails forcés dans storage/logs/mail-dev.log pour ce test (le .env peut pointer vers un vrai SMTP).
# Serveur PHP intégré lancé directement : « artisan serve » ne transmet pas ces variables.
(cd public && MAIL_MAILER=log MAIL_LOG_CHANNEL=maildev \
  exec php -S "127.0.0.1:$PORT" ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php >/dev/null 2>&1) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; (cd "$ROOT/backend" && php artisan migrate:fresh --force >/dev/null && rm -rf storage/app/private/attachments storage/logs/mail-dev.log)' EXIT
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/up" >/dev/null && break; sleep 1; done

cd "$ROOT/frontend"
KOFFRA_E2E_URL="http://127.0.0.1:$PORT" KOFFRA_E2E_TOKEN="$TOKEN" KOFFRA_E2E_MAILLOG="$ROOT/backend/storage/logs/mail-dev.log" \
  npx vitest run --config vitest.e2e.config.ts
