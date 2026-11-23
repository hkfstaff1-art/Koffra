# KOFFRA — Coffre-fort numérique privé

Application web responsive (PWA) qui centralise les informations confidentielles d'une organisation : identifiants, mots de passe, clés API, contacts, notes et pièces jointes. **Tout est chiffré dans le navigateur** (libsodium : Argon2id, XChaCha20-Poly1305, X25519). Le serveur ne stocke que des données chiffrées.

> ⚠ **Avant toute donnée réelle** : audit de sécurité indépendant et recette dans un vrai navigateur (voir [docs/13](docs/13-rapport-de-recette.md) § 5). KOFFRA n'est ni inviolable ni certifié.

## Structure
| Dossier | Contenu |
|---|---|
| `backend/` | API Laravel 13 (`/api/v1`), PHP ≥ 8.3, MySQL 8 / MariaDB 11 |
| `frontend/` | React 19 + TypeScript strict + Vite, module crypto `src/crypto` |
| `docs/` | Spécifications (01–08), conception crypto (09), modèle de données (10), déploiement Hostinger (11), sauvegarde (12), recette (13), `openapi.yaml` |
| `infra/` | `docker-compose.yml` (optionnel), scripts `build-release.sh`, `e2e.sh`, `backup.sh` |
| `branding/` | Logo source |

## Décisions validées
- Un seul rôle **administrateur** (privilèges complets), **5 comptes maximum**, **coffre partagé**.
- Codes de vérification par **email** ; nouvel appareil approuvé uniquement par code.
- Un seul mot de passe, dont dérivent deux clés indépendantes : l'une pour l'authentification serveur, l'autre pour le déchiffrement local.
- Hébergement **Hostinger**, avec l'application et l'API sur le même domaine.

## Démarrage (développement, Windows + WAMP)
Prérequis : PHP 8.3+ (extension sodium), Composer, Node 24, MySQL 8 ou MariaDB 11 (voir `infra/README.md` pour créer la base).
```bash
cd backend && composer setup && composer dev      # API : http://127.0.0.1:8000
cd frontend && npm install && npm run dev         # App : http://localhost:5173
cd backend && php artisan koffra:install          # lien de création du compte propriétaire
```
Emails en développement : `MAIL_MAILER=log` et `MAIL_LOG_CHANNEL=maildev`, qui écrivent dans `backend/storage/logs/mail-dev.log` (mode interdit en production).

## Tests
```bash
cd backend  && php artisan test && composer lint                    # 55 tests (MySQL et MariaDB)
cd frontend && npm test && npm run typecheck && npm run lint        # 60 tests
cd frontend && npm run test:e2e   # bout en bout réel (RÉINITIALISE la base de développement)
```

## Mise en production
`bash infra/scripts/build-release.sh --archive`, puis suivre [docs/11-deploiement-hostinger.md](docs/11-deploiement-hostinger.md).
Sauvegardes et restauration : [docs/12](docs/12-sauvegarde-restauration.md).

## État d'avancement
- [x] 0 — Socle : API, frontend, CI, en-têtes de sécurité
- [x] 1 — Conception cryptographique ([docs/09](docs/09-conception-cryptographique.md)) et module crypto
- [x] 2 — Modèle de données ([docs/10](docs/10-modele-donnees-implemente.md))
- [x] 3 — Installation, connexion + code, appareils, invitations, récupération, journal
- [x] 4 — API du coffre : entrées, catégories, pièces jointes, rotation, export
- [x] 5 — Interface React complète
- [x] 6 — Test de bout en bout réel
- [x] 7 — PWA, service en production, CSP
- [x] 8 — Déploiement, sauvegarde/restauration, rapport de recette
- [ ] Recette navigateur réelle, déploiement Hostinger, audit indépendant

## Règles
Ne jamais versionner `.env` ni de vraies données. Ne jamais stocker de code PIN, CVV, mot de passe de paiement ni code OTP bancaire.
