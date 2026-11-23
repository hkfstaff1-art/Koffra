# KOFFRA — Dossier de spécification

Ce dépôt contient le cahier des charges, l'architecture, les exigences de sécurité, les modèles de données, les tests, le prompt OpenCode et les ressources de marque.

## Structure
- `frontend/` : emplacement prévu pour React + TypeScript.
- `backend/` : emplacement prévu pour Laravel.
- `docs/` : documentation projet.
- `branding/logo/` : logos et icônes.

## Démarrage agent
Ouvrir le dossier racine `KOFFRA` dans OpenCode et lui demander de lire `docs/08-prompt-agent-opencode.md` ainsi que tous les documents `docs/` avant de commencer.

## État d'avancement
- [x] Étape 0 — socle : API Laravel 13 (`/api/v1`, cookies de session Sanctum, CORS, en-têtes de sécurité), frontend React/TS/Vite, docker-compose de dev, CI.
- [x] Étape 1 — conception cryptographique (`docs/09`) + module crypto frontend (`frontend/src/crypto`, 35 tests).
- [x] Étape 2 — modèle de données (13 tables métier, `docs/10`), testé sur MySQL 8.4 et MariaDB 11.4.
- [x] Étape 3 — installation du propriétaire (`php artisan koffra:install`), connexion + OTP email, appareils, réauthentification, invitations (5 comptes max), partage scellé de la clé du coffre, désactivation, changement de mot de passe, récupération, journal ; contrat `docs/openapi.yaml`.
- [x] Étape 4 — API du coffre : entrées chiffrées (révisions anti-écrasement), catégories à nom chiffré, favoris, archivage, corbeille, pièces jointes chiffrées, rotation de clé, export chiffré.
- [x] Étape 5 — interface React : installation, connexion + code, déverrouillage, coffre (recherche locale, filtres, détail, édition, pièces jointes), catégories, générateur, appareils, administrateurs (empreinte), journal, paramètres (mot de passe, clé de récupération, export/import chiffrés, rotation, verrouillage auto).
- [x] Étape 6 — test de bout en bout réel (`npm run test:e2e`) : chiffrement réel + API réelle, installation, entrée, pièce jointe, invitation avec empreinte, rotation, export.
- [ ] Étapes suivantes : voir `docs/07-plan-de-realisation.md`.

## Décisions validées
- OTP par **email** uniquement.
- Hébergement de production : **Hostinger**.
- Un seul rôle **admin**, 5 comptes maximum, partageant **le même coffre**.
- Une seule saisie de mot de passe, dont dérivent deux clés indépendantes (authentification serveur / déchiffrement local).

## Démarrage rapide (développement)
```bash
cd backend && composer setup && composer dev     # API : http://127.0.0.1:8000
cd frontend && npm install && npm run dev        # App : http://localhost:5173
```

## Important
Ce dossier est un cahier des charges et un kit de marque, pas encore une application développée. Ne pas y enregistrer de vrais mots de passe. Faire auditer la conception cryptographique avant production.
