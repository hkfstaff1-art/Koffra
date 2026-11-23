# Déploiement automatique HKF STAFF (GitHub Actions → Hostinger)

> **Pour l'agent IA qui lit ce fichier dans un projet :** ce document décrit le schéma de déploiement standard
> de HKF STAFF, **éprouvé en production** (Pointéo, 23/11/2026). Applique-le au projet courant sans reposer à
> l'utilisateur les questions déjà résolues ici. Demande uniquement ce qui est propre au projet (§2).
> Ce fichier ne contient et ne doit contenir **aucun secret** (mot de passe, clé privée, jeton).

---

## 1. Infrastructure commune (connue et vérifiée)

| Élément | Valeur |
|---|---|
| Hébergeur | Hostinger (hPanel), hébergement web avec SSH |
| Hôte / port / utilisateur SSH | `92.113.28.181` / `65002` / `u590111860` |
| Clé SSH de déploiement | `~/.ssh/pointeo_deploy` sur le PC de développement (Windows, utilisateur « HKF STAFF »). Clé publique « pointeo-deploy-hkfstaff » **déjà autorisée** dans hPanel → Accès SSH. À réutiliser pour tous les projets. |
| Empreintes du serveur | `ssh-keyscan -p 65002 92.113.28.181` (3 lignes : ecdsa, ed25519, rsa) |
| Domaine principal | `hkfstaff.com` (site WordPress dans `~/domains/hkfstaff.com/public_html` : **ne jamais y toucher**) |
| Dossier web d'un sous-domaine | créé par hPanel dans `~/domains/hkfstaff.com/public_html/<sous-domaine>` |
| **Code des applications** | `~/apps/<projet>` = `/home/u590111860/apps/<projet>` (hors dossier web ; `~/domains/hkfstaff.com/` contient un fichier `DO_NOT_UPLOAD_HERE`) |
| PHP en ligne de commande | `php` = `/usr/bin/php`, **8.4** (autres versions : `/opt/alt/phpXX/usr/bin/php`) |
| Extensions PHP présentes | bcmath, curl, dom, fileinfo, gd, intl, mbstring, openssl, pdo_mysql, xml, zip ; Argon2id OK ; **pas de sodium** |
| Outils serveur | rsync, git, composer, client mysql présents ; **pas de `crontab` en SSH** (cron via hPanel uniquement) |
| Base de données | **MariaDB 11.8**, InnoDB par défaut, hôte `localhost`. Base et utilisateur créés dans hPanel, préfixés `u590111860_` |
| SMTP | `smtp.hostinger.com`, port `465`, `MAIL_SCHEME=smtps`, compte `contact@hkfstaff.com`, `MAIL_FROM_NAME="HKF STAFF"`. **Testé OK.** Le mot de passe est fourni par l'utilisateur, uniquement pour le `.env` du serveur. |
| GitHub | compte `hkfstaff1-art`, dépôts privés. Le jeton GitHub est stocké dans le gestionnaire d'identifiants Git du PC (sert au push ; utilisable pour l'API **avec l'accord de l'utilisateur**). |
| CDN / proxy | aucun (l'IP vue par Laravel est celle du client) |

**Projets déployés selon ce schéma**

| Projet | URL | `DEPLOY_PATH` |
|---|---|---|
| Pointéo | https://pointeo.hkfstaff.com | `/home/u590111860/apps/pointeo` |
| KOFFRA | https://koffra.hkfstaff.com | `/home/u590111860/apps/koffra` (monorepo : on déploie `KOFFRA/backend`, frontend compilé copié dans `public/`) |

## 2. À demander à l'utilisateur pour un nouveau projet (et seulement cela)

1. Le **sous-domaine** (ex. `monprojet.hkfstaff.com`) : il le crée dans hPanel → Domaines → Sous-domaines (SSL automatique).
2. La **base de données** : il la crée dans hPanel et donne nom, utilisateur et mot de passe.
3. Le **dépôt GitHub** (`hkfstaff1-art/<projet>`) s'il n'est pas déjà le remote `origin`.
4. Son **accord pour utiliser le jeton GitHub du PC** afin de créer les secrets (sinon : lui fournir les valeurs à coller).
5. L'**email et le nom de l'administrateur** de l'application, si elle en a un.

Après le déploiement, il reste à l'utilisateur à **ajouter la tâche cron dans hPanel** (§4.5) : c'est la seule
action qui ne peut pas être faite en SSH.

## 3. Principe

```
git push (main) ──► GitHub Actions (.github/workflows/ci-cd.yml)
                    ├─ job « tests »  : composer, npm build, Pint, tests (MySQL 8.4), audits — sur chaque push / PR
                    └─ job « deploy » : uniquement si tests OK et branche main
                         1. build de production (composer --no-dev, npm run build) dans GitHub
                         2. ssh : .env présent ? PHP ≥ 8.3 ? rsync ?
                         3. ssh : php artisan down
                         4. rsync du code (exclut .env, storage/, bootstrap/cache/*.php, tests, .git, docs)
                         5. ssh : migrate --force, optimize:clear, config/route/view:cache, php artisan up
                         6. curl APP_URL/up  → doit répondre 200
                         échec → php artisan up (remise en ligne)
```

Le serveur n'a besoin ni de Node ni de Composer. Sans secrets configurés, le job de déploiement est ignoré
proprement (avertissement) et seuls les tests tournent.

## 4. Procédure (Laravel) — à exécuter par l'agent

```bash
SSH="ssh -i ~/.ssh/pointeo_deploy -p 65002 -o BatchMode=yes u590111860@92.113.28.181"
SCP="scp -i ~/.ssh/pointeo_deploy -P 65002"
P=<projet>                     # ex. monprojet
SUB=<sous-domaine>             # ex. monprojet (dossier créé par hPanel)
```

### 4.1 Vérifier l'accès et repérer le dossier du sous-domaine

```bash
$SSH 'whoami; ls ~/domains/hkfstaff.com/public_html; php -v | head -1'
```

### 4.2 Dossier de l'application et droits — ⚠ IMPORTANT

```bash
$SSH "mkdir -p ~/apps/$P && chmod 711 ~/apps ~/apps/$P"
```

Le serveur web accède aux fichiers par le groupe (home en `710`) : `~/apps` et `~/apps/<projet>` doivent être en
**`711`** (ou `755`). En `750`, **tout le site répond 404** (y compris `/index.php`). Problème rencontré et corrigé sur Pointéo.

### 4.3 Fichier `.env` de production

- Partir du `.env.example` du projet ; `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://<sous-domaine>.hkfstaff.com`,
  `LOG_LEVEL=warning`, `SESSION_SECURE_COOKIE=true`, `QUEUE_CONNECTION=sync`, `DB_HOST=localhost` + identifiants, SMTP (§1).
- `APP_KEY` : générer **localement** avec `php artisan key:generate --show` (une seule fois ; ne jamais régénérer en production).
- Mettre les mots de passe entre guillemets s'ils contiennent `#`, `@`, espaces…
- Écrire le fichier dans le dossier temporaire de session (jamais dans le dépôt), puis :

```bash
$SCP <fichier_env> u590111860@92.113.28.181:apps/$P/.env && $SSH "chmod 600 ~/apps/$P/.env"
$SSH "MYSQL_PWD='<mdp_bdd>' mysql -h localhost -u <user_bdd> <base> -e 'select version()'"   # test BDD
```

### 4.4 Relier le sous-domaine au dossier `public`

```bash
$SSH "W=~/domains/hkfstaff.com/public_html/$SUB; [ -d \$W ] && [ ! -L \$W ] && mkdir -p ~/apps/_sauvegardes && mv \$W ~/apps/_sauvegardes/$SUB-dossier-hpanel-origine; ln -sfn /home/u590111860/apps/$P/public \$W; ls -la ~/domains/hkfstaff.com/public_html | grep $SUB"
```

(LiteSpeed suit le lien symbolique : vérifié.) Le dossier d'origine de hPanel ne contient que `default.php`.

### 4.5 Tâche cron (à faire par l'utilisateur dans hPanel → Avancé → Tâches Cron)

Toutes les minutes : `/usr/bin/php /home/u590111860/apps/<projet>/artisan schedule:run >> /dev/null 2>&1`

### 4.6 Secrets et variables GitHub

| Type | Nom | Valeur |
|---|---|---|
| Secret | `SSH_HOST` | `92.113.28.181` |
| Secret | `SSH_PORT` | `65002` |
| Secret | `SSH_USER` | `u590111860` |
| Secret | `SSH_PRIVATE_KEY` | contenu de `~/.ssh/pointeo_deploy` |
| Secret | `SSH_KNOWN_HOSTS` | sortie de `ssh-keyscan -p 65002 92.113.28.181` (sans les lignes `#`) |
| Secret | `DEPLOY_PATH` | `/home/u590111860/apps/<projet>` |
| Variable | `APP_URL` | `https://<sous-domaine>.hkfstaff.com` |
| Variable | `PHP_BIN` | `php` |

Création par l'API (avec l'accord de l'utilisateur) : script de l'annexe A, lancé ainsi depuis Git Bash :

```bash
export GH_TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')
export CA_BUNDLE="$(cygpath -w /usr/ssl/certs/ca-bundle.crt)"     # PHP Windows n'a pas de certificats CA par défaut
export KNOWN_HOSTS="$(ssh-keyscan -p 65002 -T 15 92.113.28.181 2>/dev/null | grep -v '^#')"
export DEPLOY_PATH=/home/u590111860/apps/<projet> APP_URL=https://<sous-domaine>.hkfstaff.com
php github-secrets.php hkfstaff1-art/<depot>
```

Ne jamais afficher le jeton ni la clé privée dans la sortie.

### 4.7 Workflow

Copier `.github/workflows/ci-cd.yml` depuis le dépôt `hkfstaff1-art/Pointeo` et n'adapter que : version PHP / Node,
extensions, service de base de test, commande de tests, exclusions rsync propres au projet. Puis commit + push sur `main`.

### 4.8 Suivre le déploiement

Script de l'annexe B (mêmes variables `GH_TOKEN` et `CA_BUNDLE`) :

```bash
php gh-run.php hkfstaff1-art/<depot> dispatch   # lance le workflow sur main (facultatif si push)
php gh-run.php hkfstaff1-art/<depot> wait       # attend la fin et affiche chaque étape
php gh-run.php hkfstaff1-art/<depot> logs <job_id> 120
```

Puis vérifier : `curl -s -o /dev/null -w "%{http_code}" https://<sous-domaine>.hkfstaff.com/up` → `200`,
et `https://<sous-domaine>.hkfstaff.com/.env` → `403` ou `404`.

### 4.9 Premier lancement de l'application

```bash
$SSH "cd ~/apps/$P && php artisan db:seed --force"     # si seeders de référence idempotents
```

Compte administrateur : créé avec un **mot de passe provisoire** (changement imposé à la 1re connexion), communiqué
à l'utilisateur. Tester l'email une fois :
`php artisan tinker --execute "Mail::raw('Test', fn (\$m) => \$m->to('contact@hkfstaff.com')->subject('Test SMTP'));"`

## 5. Pièges déjà rencontrés

| Symptôme | Cause | Solution |
|---|---|---|
| Tout le site en 404 (page Hostinger), même `/index.php` | `~/apps` en 750 | `chmod 711 ~/apps ~/apps/<projet>` |
| Erreur PHP `unable to get local issuer certificate` (API GitHub depuis Windows) | PHP local sans CA | `CURLOPT_CAINFO` = `cygpath -w /usr/ssl/certs/ca-bundle.crt` |
| `ssh-keyscan` vide dans un script PHP Windows | `shell_exec` passe par cmd.exe | calculer l'empreinte en Bash et la passer en variable d'environnement |
| Tables sans clés étrangères | MyISAM sur certains MariaDB | `engine => InnoDB` dans `config/database.php` |
| Caméra / GPS bloqués | page en `http://` | HTTPS obligatoire (test local depuis un téléphone = impossible en http) |
| Contrôle par IP qui refuse un téléphone sur le bon Wi-Fi | IPv6 de la box | autoriser le préfixe `/64` |
| Confirmation de mot de passe Fortify en erreur | champ de connexion ≠ colonne | `Fortify::confirmPasswordsUsing` + accesseur |
| Action bloquée par un SMTP lent | envoi synchrone | envoyer après la réponse (`defer`) et capturer les erreurs |
| Sessions perdues après mise à jour | `key:generate` relancé | ne jamais régénérer `APP_KEY` en production |
| Heredocs Bash cassés (poste Windows) | `\'` dans un heredoc | écrire les fichiers avec l'outil d'écriture |
| Deux en-têtes CSP | Hostinger ajoute `upgrade-insecure-requests` | normal, sans effet négatif |

---

## Annexe A — `github-secrets.php` (création des secrets / variables)

```php
<?php
// Usage : GH_TOKEN, CA_BUNDLE, KNOWN_HOSTS, DEPLOY_PATH, APP_URL dans l'environnement.
//         php github-secrets.php owner/repo
$repo = $argv[1];
$token = getenv('GH_TOKEN') ?: exit("GH_TOKEN manquant\n");
$home = getenv('USERPROFILE') ?: getenv('HOME');
$api = function (string $method, string $path, ?array $body = null) use ($token): array {
    $ch = curl_init("https://api.github.com{$path}");
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ["Authorization: Bearer {$token}", 'Accept: application/vnd.github+json',
            'X-GitHub-Api-Version: 2022-11-28', 'User-Agent: hkfstaff-deploy', 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $body === null ? null : json_encode($body)]);
    if ($ca = getenv('CA_BUNDLE')) { curl_setopt($ch, CURLOPT_CAINFO, $ca); }
    $raw = curl_exec($ch);
    return [curl_getinfo($ch, CURLINFO_HTTP_CODE), json_decode((string) $raw, true)];
};
[$code, $key] = $api('GET', "/repos/{$repo}/actions/secrets/public-key");
if ($code !== 200) { exit("Clé publique du dépôt inaccessible (HTTP {$code})\n"); }
$pk = base64_decode($key['key']);
$secrets = [
    'SSH_HOST' => '92.113.28.181', 'SSH_PORT' => '65002', 'SSH_USER' => 'u590111860',
    'DEPLOY_PATH' => getenv('DEPLOY_PATH'),
    'SSH_PRIVATE_KEY' => trim((string) file_get_contents($home.'/.ssh/pointeo_deploy'))."\n",
    'SSH_KNOWN_HOSTS' => trim((string) getenv('KNOWN_HOSTS')),
];
foreach ($secrets as $name => $value) {
    if (trim((string) $value) === '') { exit("Valeur vide pour {$name}\n"); }
    [$c] = $api('PUT', "/repos/{$repo}/actions/secrets/{$name}", ['encrypted_value' => base64_encode(sodium_crypto_box_seal($value, $pk)), 'key_id' => $key['key_id']]);
    echo "{$name} : HTTP {$c}\n";
}
foreach (['APP_URL' => getenv('APP_URL'), 'PHP_BIN' => 'php'] as $name => $value) {
    [$c] = $api('PATCH', "/repos/{$repo}/actions/variables/{$name}", ['name' => $name, 'value' => $value]);
    if ($c === 404) { [$c] = $api('POST', "/repos/{$repo}/actions/variables", ['name' => $name, 'value' => $value]); }
    echo "{$name} (variable) : HTTP {$c}\n";
}
```

(Le PHP **local** a sodium ; il sert uniquement au chiffrement des secrets, pas au serveur.)

## Annexe B — `gh-run.php` (lancer / suivre un workflow)

```php
<?php
// php gh-run.php owner/repo dispatch | wait | logs <job_id> [lignes]
$repo = $argv[1]; $action = $argv[2] ?? 'wait';
$token = getenv('GH_TOKEN') ?: exit("GH_TOKEN manquant\n");
$api = function (string $method, string $path, ?array $body = null, bool $raw = false) use ($token) {
    $ch = curl_init("https://api.github.com{$path}");
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER => ["Authorization: Bearer {$token}", 'Accept: application/vnd.github+json', 'User-Agent: hkfstaff-deploy', 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $body === null ? null : json_encode($body)]);
    if ($ca = getenv('CA_BUNDLE')) { curl_setopt($ch, CURLOPT_CAINFO, $ca); }
    $out = curl_exec($ch);
    return [curl_getinfo($ch, CURLINFO_HTTP_CODE), $raw ? $out : json_decode((string) $out, true)];
};
if ($action === 'dispatch') { [$c] = $api('POST', "/repos/{$repo}/actions/workflows/ci-cd.yml/dispatches", ['ref' => 'main']); exit("dispatch HTTP {$c}\n"); }
if ($action === 'logs') { [, $log] = $api('GET', "/repos/{$repo}/actions/jobs/{$argv[3]}/logs", null, true); echo implode("\n", array_slice(explode("\n", (string) $log), -(int) ($argv[4] ?? 80))), "\n"; exit; }
$deadline = time() + 1500;
do { [, $runs] = $api('GET', "/repos/{$repo}/actions/runs?per_page=1&branch=main"); $run = $runs['workflow_runs'][0] ?? null;
     if ($run && $run['status'] === 'completed') { break; } sleep(20); } while (time() < $deadline);
echo "Run #{$run['run_number']} : {$run['status']} / ".($run['conclusion'] ?? '—')."\n";
[, $jobs] = $api('GET', "/repos/{$repo}/actions/runs/{$run['id']}/jobs");
foreach ($jobs['jobs'] ?? [] as $job) {
    echo "\n== {$job['name']} [id {$job['id']}] : ".($job['conclusion'] ?? $job['status'])."\n";
    foreach ($job['steps'] ?? [] as $s) { echo '   '.str_pad($s['conclusion'] ?? $s['status'], 10).' '.$s['name']."\n"; }
}
```
