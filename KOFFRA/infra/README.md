# Infrastructure KOFFRA

## Développement local
`docker-compose.yml` fournit MySQL 8.4 et Mailpit (boîte mail de test pour les OTP).

```bash
docker compose -f infra/docker-compose.yml up -d
```

Puis dans `backend/.env` :

```dotenv
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=koffra
DB_USERNAME=koffra
DB_PASSWORD=koffra_dev_only
MAIL_HOST=127.0.0.1
MAIL_PORT=1025
```

Emails reçus : http://localhost:8025

## Intégration continue
`.github/workflows/koffra-ci.yml` (à la racine du dépôt Git) : Pint, tests backend sur SQLite et MySQL 8, lint/typecheck/tests/build frontend, audits de dépendances.

## Production — Hostinger
Le guide de déploiement (PHP 8.3+, MySQL, SMTP Hostinger, cron pour la queue et le planificateur, HTTPS, en-têtes du frontend) sera rédigé à l'étape 8.
