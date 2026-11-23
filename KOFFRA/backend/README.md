# Backend KOFFRA — API Laravel

API REST versionnée (`/api/v1`) du coffre-fort KOFFRA. Laravel 13, PHP ≥ 8.3 (extension `sodium` requise).

## Installation locale

```bash
composer setup        # install, .env, APP_KEY (conservée si déjà définie), sqlite, migrations
composer dev          # php artisan serve → http://127.0.0.1:8000
```

Base MySQL 8 et Mailpit (réception des OTP) : voir `../infra/README.md`, puis adapter `DB_*` et `MAIL_*` dans `.env`.

## Qualité

```bash
composer test         # tests PHPUnit
composer lint         # style (Pint) — `composer format` pour corriger
composer audit        # vulnérabilités des dépendances
```

> `lint`/`format` lancent Pint avec `opcache.enable_cli=0` : sur ce poste, l'opcache CLI
> renvoyait le phar Pint d'un autre projet.

## Choix de sécurité en place
- Authentification SPA par cookie de session (Sanctum stateful) : aucun token API émis ni stocké côté navigateur.
- Sessions chiffrées, `HttpOnly`, `SameSite=Strict`, expiration courte (`.env.example`).
- CORS limité à `FRONTEND_URL`, avec credentials.
- En-têtes de sécurité sur toutes les réponses (`app/Http/Middleware/SecurityHeaders.php`) : CSP `default-src 'none'`, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, HSTS en HTTPS, `Cache-Control: no-store` sur l'API.
- Champs sensibles exclus des données réaffichées en cas d'erreur de validation (`bootstrap/app.php`).
