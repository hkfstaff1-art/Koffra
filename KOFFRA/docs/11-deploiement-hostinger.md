# KOFFRA — Déploiement sur Hostinger

> Cible : hébergement **mutualisé / Cloud Hostinger** (Apache/LiteSpeed, PHP, MySQL/MariaDB, cron, SSH).
> Fonctionne aussi sur VPS. **Ne pas y stocker de données réelles avant l'audit de sécurité indépendant.**

## 1. Principe
- **Un seul domaine** (ex. `coffre.votre-domaine.com`) sert l'application React **et** l'API `/api/v1` : les cookies de session restent `SameSite=Strict`.
- Laravel sert la page de l'application (`spa.html`, CSP stricte) ; Apache sert les fichiers statiques (`assets/`, `sw.js`…).
- Le code Laravel est placé **hors** du dossier web ; seul `public/` est exposé.
- Le frontend est compilé **sur votre poste** (Node n'est pas nécessaire sur le serveur).

## 2. Préparer l'hébergement (hPanel)
1. **Sous-domaine** dédié, par exemple `coffre.votre-domaine.com`.
2. **SSL** : activer le certificat (Let's Encrypt) et **forcer HTTPS**.
3. **PHP ≥ 8.3** avec les extensions `sodium`, `pdo_mysql`, `mbstring`, `openssl`, `fileinfo`, `intl`.
4. **Base de données** : créer une base MySQL et un utilisateur dédié, avec un mot de passe long et aléatoire.
5. **Email** : une boîte `no-reply@votre-domaine.com` pour les codes de vérification et les invitations.
6. **SSH** : activer l'accès (Avancé → Accès SSH).

## 3. Construire la version (sur votre poste)
```bash
bash infra/scripts/build-release.sh --archive
```
Ce script lance les tests et la compilation du frontend, le copie dans `backend/public`, puis produit `koffra-release-AAAAMMJJ-HHMM.tar.gz`. L'archive ne contient ni `.env`, ni `vendor`, ni les tests.

## 4. Installer sur le serveur (SSH)
```bash
mkdir -p ~/koffra && cd ~/koffra
tar -xzf ~/koffra-release-*.tar.gz            # archive envoyée via le gestionnaire de fichiers ou scp
composer install --no-dev --optimize-autoloader
cp .env.example .env && nano .env             # voir § 5
php artisan key:generate                       # UNE SEULE FOIS, puis sauvegarder APP_KEY hors ligne
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
chmod -R u+rwX,go-rwx storage bootstrap/cache
```

**Exposer uniquement `public/`.** Le dossier web du sous-domaine est en général `~/domains/coffre.votre-domaine.com/public_html` :
```bash
mv ~/domains/coffre.votre-domaine.com/public_html ~/public_html.ancien   # garder une copie
ln -s ~/koffra/public ~/domains/coffre.votre-domaine.com/public_html
```
> ⚠ Ne placez jamais le dossier Laravel *dans* un `public_html` : le fichier `.env` deviendrait téléchargeable.

## 5. `.env` de production
```dotenv
APP_NAME=KOFFRA
APP_ENV=production
APP_DEBUG=false
APP_URL=https://coffre.votre-domaine.com
FRONTEND_URL=https://coffre.votre-domaine.com
APP_LOCALE=fr
APP_FALLBACK_LOCALE=fr

LOG_CHANNEL=daily
LOG_LEVEL=warning

DB_CONNECTION=mariadb            # ou mysql selon la base proposée par hPanel
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=uXXXX_koffra
DB_USERNAME=uXXXX_koffra
DB_PASSWORD=<mot de passe aléatoire>

SESSION_DRIVER=database
SESSION_LIFETIME=30
SESSION_EXPIRE_ON_CLOSE=true
SESSION_ENCRYPT=true
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=strict
SANCTUM_STATEFUL_DOMAINS=coffre.votre-domaine.com

HASH_DRIVER=argon2id
QUEUE_CONNECTION=database
CACHE_STORE=database

MAIL_MAILER=smtp
MAIL_SCHEME=smtps
MAIL_HOST=smtp.hostinger.com
MAIL_PORT=465
MAIL_USERNAME=no-reply@votre-domaine.com
MAIL_PASSWORD=<mot de passe de la boîte>
MAIL_FROM_ADDRESS=no-reply@votre-domaine.com
MAIL_FROM_NAME=KOFFRA
```
L'application **refuse de démarrer** en production si `APP_DEBUG=true`, si `SESSION_SECURE_COOKIE` vaut `false`, ou si le mailer est `log`/`array`.

## 6. Tâches planifiées (hPanel → Avancé → Tâches Cron)
| Fréquence | Commande |
|---|---|
| Chaque minute | `/usr/bin/php /home/<compte>/koffra/artisan schedule:run >> /dev/null 2>&1` |
| Chaque jour à 2 h | `KOFFRA_DIR=/home/<compte>/koffra BACKUP_DIR=/home/<compte>/sauvegardes /bin/bash /home/<compte>/koffra-scripts/backup.sh` |

`schedule:run` exécute le nettoyage quotidien (`koffra:prune`) et la file d'attente. Copiez `infra/scripts/backup.sh` dans `~/koffra-scripts/` (voir docs/12).

## 7. Créer le compte propriétaire
```bash
cd ~/koffra && php artisan koffra:install
```
Ouvrez le lien affiché (valable 30 minutes, usage unique) **vous-même**, sur l'appareil du propriétaire. Notez la clé de récupération hors ligne.

## 8. Vérifications après mise en ligne
```bash
curl -sI https://coffre.votre-domaine.com/ | grep -iE 'content-security|strict-transport|x-frame'
curl -s  https://coffre.votre-domaine.com/api/v1/health      # {"status":"ok",...}
curl -sI http://coffre.votre-domaine.com/ | head -1          # redirection vers HTTPS attendue
curl -sI https://coffre.votre-domaine.com/.env | head -1     # 403 ou 404 attendu
```
Contrôle navigateur : connexion, réception du code par email, ajout d'une entrée, verrouillage, puis déverrouillage.

## 9. Mise à jour
1. Sur le poste : `git pull`, puis `bash infra/scripts/build-release.sh --archive`.
2. Sur le serveur : `php artisan down`, sauvegarde (§ 6), extraction de l'archive **sans écraser `.env` ni `storage/`**, `composer install --no-dev -o`, `php artisan migrate --force`, `php artisan optimize`, puis `php artisan up`.

## 10. Limites liées au mutualisé
- Pas de worker permanent : la file d'attente est traitée chaque minute par cron. Les emails de code sont envoyés immédiatement (en synchrone).
- La taille des pièces jointes est limitée à 10 Mo par KOFFRA, et aussi par `upload_max_filesize` / `post_max_size` de PHP (hPanel → Configuration PHP). Prévoyez au moins 12M.
- Les paramètres Argon2id serveur (64 Mio) consomment de la mémoire à chaque connexion. Le rate limiting évite les abus.
