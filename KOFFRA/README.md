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
