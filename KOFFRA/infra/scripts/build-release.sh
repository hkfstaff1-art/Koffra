#!/usr/bin/env bash
# Construit une version déployable : frontend compilé et copié dans backend/public
# (index.html → spa.html, servi par Laravel sur le même domaine que l'API).
# Usage : bash infra/scripts/build-release.sh [--archive]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "▶ Frontend : tests + build"
cd "$ROOT/frontend"
npm ci
npm run typecheck
npm test
npm run build

echo "▶ Copie du build dans backend/public"
PUB="$ROOT/backend/public"
rm -rf "$PUB/assets" "$PUB/brand" "$PUB/spa.html" "$PUB/sw.js" "$PUB/registerSW.js" "$PUB"/workbox-*.js "$PUB/manifest.webmanifest" "$PUB"/*.png
cp -r dist/assets dist/brand "$PUB/"
cp dist/sw.js dist/registerSW.js dist/workbox-*.js dist/manifest.webmanifest dist/*.png "$PUB/"
cp dist/index.html "$PUB/spa.html"

if [[ "${1:-}" == "--archive" ]]; then
  echo "▶ Archive de déploiement (sans .env, sans dépendances de dev)"
  cd "$ROOT/backend"
  OUT="$ROOT/koffra-release-$(date +%Y%m%d-%H%M).tar.gz"
  tar --exclude='./.env' --exclude='./.env.*' --exclude='./vendor' --exclude='./node_modules' \
      --exclude='./storage/logs/*' --exclude='./storage/app/private/*' --exclude='./database/database.sqlite' \
      --exclude='./tests' -czf "$OUT" .
  echo "Archive : $OUT (lancer « composer install --no-dev --optimize-autoloader » sur le serveur)"
fi

echo "✔ Prêt. Vérification locale : cd backend && php artisan serve → http://127.0.0.1:8000"
