# KOFFRA — Architecture et stack validées

## Stack
- Frontend : React + TypeScript, Vite.
- Backend : Laravel (version stable compatible avec l'environnement cible), API REST.
- Base de données : MySQL 8.x.
- Dépôt Git unique : `KOFFRA`.
- Communication : HTTPS uniquement, JSON, API versionnée `/api/v1`.
- PWA : service worker limité au shell applicatif ; ne jamais mettre en cache les réponses contenant des secrets.

## Arborescence obligatoire
```text
KOFFRA/
├── frontend/       # React + TypeScript + Vite
├── backend/        # Laravel API
├── docs/           # spécifications, architecture, sécurité, API, tests
├── branding/       # logo, icônes, identité graphique
├── infra/          # Docker/dev scripts et exemples de déploiement
├── .gitignore
└── README.md
```
Le frontend et le backend ont leurs propres dépendances et fichiers de configuration, mais sont versionnés dans le même dépôt Git. Ne pas créer deux dépôts séparés.

## Frontend
Organisation suggérée : `src/app`, `components`, `features`, `pages`, `services/api`, `crypto`, `hooks`, `types`, `styles`. Utiliser React Router, TanStack Query si utile, React Hook Form + Zod pour les formulaires. Éviter le surdimensionnement des dépendances.

## Backend
Architecture Laravel structurée : contrôleurs minces, Form Requests, Services métier, Policies, Resources API, Jobs, Events et tests. Utiliser Sanctum ou une stratégie de session sécurisée adaptée à la PWA ; privilégier cookies HttpOnly/Secure/SameSite si même domaine. Ne pas stocker de token durable dans localStorage.

## Modèle logique
- users : comptes autorisés, email/téléphone vérifiés, statut.
- trusted_devices : appareils approuvés, empreinte non réversible, dernière activité, révocation.
- sessions : sessions actives et révocation.
- otp_challenges : challenge, hash du code, expiration, tentatives, canal masqué.
- vault_items : propriétaire, catégorie, métadonnées minimales, payload chiffré, nonce, version de clé.
- categories : catégories personnalisées.
- attachments : métadonnées et blob chiffré.
- activity_logs : événements sans secrets.
- recovery_records : métadonnées de récupération, jamais la clé en clair.
- password_reset_requests : flux de récupération contrôlé.

Toutes les tables utilisent des clés primaires internes, timestamps, index utiles, contraintes FK et migrations Laravel. Les valeurs sensibles doivent être chiffrées côté client avant persistance.

## API indicative
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/otp/verify`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`
- `GET/POST /api/v1/vault-items`
- `GET/PATCH/DELETE /api/v1/vault-items/{id}`
- `GET/POST /api/v1/categories`
- `GET/POST /api/v1/devices`, `DELETE /api/v1/devices/{id}`
- `GET /api/v1/activity`
- `POST /api/v1/exports/encrypted`
- `POST /api/v1/recovery/verify`

Les endpoints réels devront être documentés dans OpenAPI.
