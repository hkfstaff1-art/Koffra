#!/usr/bin/env bash
# Sauvegarde KOFFRA : base MySQL/MariaDB + pièces jointes chiffrées (docs/12).
# Les données du coffre sont déjà chiffrées de bout en bout : la sauvegarde ne contient aucun secret en clair.
# ⚠ APP_KEY (.env) n'est PAS incluse : conservez-la séparément (gestionnaire de secrets / support hors ligne).
#
# Usage (sur le serveur, ex. cron quotidien) :
#   KOFFRA_DIR=/home/<compte>/koffra BACKUP_DIR=/home/<compte>/sauvegardes bash backup.sh
set -euo pipefail
KOFFRA_DIR="${KOFFRA_DIR:?KOFFRA_DIR requis (dossier racine Laravel)}"
BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR requis (hors du dossier public)}"
KEEP_DAYS="${KEEP_DAYS:-30}"

env_get() { grep -E "^$1=" "$KOFFRA_DIR/.env" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
DB_HOST="$(env_get DB_HOST)"; DB_PORT="$(env_get DB_PORT)"; DB_DATABASE="$(env_get DB_DATABASE)"
DB_USERNAME="$(env_get DB_USERNAME)"; DB_PASSWORD="$(env_get DB_PASSWORD)"

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/koffra-$STAMP"
umask 077
mkdir -p "$TARGET"

# Mot de passe transmis par fichier temporaire (jamais en argument visible dans la liste des processus)
CNF="$(mktemp)"; trap 'rm -f "$CNF"' EXIT
printf '[client]\nuser=%s\npassword=%s\nhost=%s\nport=%s\n' "$DB_USERNAME" "$DB_PASSWORD" "${DB_HOST:-127.0.0.1}" "${DB_PORT:-3306}" > "$CNF"

mysqldump --defaults-extra-file="$CNF" --single-transaction --routines --no-tablespaces "$DB_DATABASE" | gzip > "$TARGET/database.sql.gz"
# Chemins relatifs : compatibles GNU tar (Linux) et tar de Git Bash (Windows)
mkdir -p "$KOFFRA_DIR/storage/app/private"
( cd "$KOFFRA_DIR/storage/app" && tar -czf - private ) > "$TARGET/attachments.tar.gz"
( cd "$TARGET" && sha256sum database.sql.gz attachments.tar.gz > SHA256SUMS )

find "$BACKUP_DIR" -maxdepth 1 -type d -name 'koffra-*' -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "Sauvegarde créée : $TARGET"
