# KOFFRA — Rapport de recette (développement, 2026-11-23)

Environnement : Windows 11, PHP 8.4.26, Node 24.22, MySQL 8.4.7 et MariaDB 11.4.9 (WAMP).
Ce rapport distingue ce qui est **testé automatiquement**, **vérifié manuellement** et **non vérifié**.

## 1. Tests automatisés
| Suite | Commande | Résultat |
|---|---|---|
| Backend (PHPUnit), MySQL 8.4 | `cd backend && php artisan test` | **55/55** |
| Backend, MariaDB 11.4 (base de type Hostinger) | `DB_CONNECTION=mariadb DB_PORT=3307 php artisan test` | **55/55** |
| Frontend (Vitest) : crypto, modèle, client API, écrans | `cd frontend && npm test` | **60/60** |
| Bout en bout réel (crypto + API réelles) | `cd frontend && npm run test:e2e` | **7/7** |
| Style PHP (Pint), TypeScript strict, lint (oxlint) | `composer lint`, `npm run typecheck`, `npm run lint` | OK (oxlint : avertissements « fast refresh » seulement) |
| Contrat OpenAPI ↔ routes | `OpenApiContractTest` | OK (48 opérations, toutes les routes documentées) |
| Audit des dépendances | `composer audit`, `npm audit` | Composer : 0. npm : 4 modérées dans les outils de build (glob/minimatch via Workbox), absentes de l'application livrée |

## 2. Couverture des exigences (docs/06)
| Exigence | Preuve |
|---|---|
| Installation sans inscription publique | `SetupAndLoginTest` (jeton CLI + code email, rejeu refusé), e2e |
| OTP correct, incorrect, expiré, réutilisé, tentatives limitées | `SetupAndLoginTest::test_otp_cannot_be_reused_expires_and_locks…` |
| Nouvel appareil sans auto-approbation | `test_new_device_requires_an_email_code_and_cannot_self_approve` (autre navigateur refusé) |
| Invitation, révocation, plafond de 5, journalisation | `AdminSecurityFlowsTest`, e2e (empreinte et sealed box) |
| CRUD entrées, catégories, pièces jointes ; favoris, archives, corbeille | `VaultApiTest`, e2e |
| Recherche locale | `model.test.ts` (accents, multi-mots, secrets jamais indexés) |
| Générateur, presse-papiers | `extras.test.ts` (générateur). Effacement du presse-papiers : code présent, **non testé automatiquement** (dépend du navigateur) |
| Export chiffré et restauration | `extras.test.ts`, `VaultApiTest`, e2e. Sauvegarde serveur restaurée sur base vierge (manuel, § 3) |
| Appareils, déconnexion, révocation distante | `test_revoked_device_is_rejected_on_next_request`, `test_disabling_an_admin_cuts_access_immediately` |
| Aucun secret en clair en base ni dans les logs | `test_no_secret_value_is_stored_in_clear_in_database_or_logs`, e2e (réponses API) |
| Ciphertext modifié rejeté (tag Poly1305) | `crypto.test.ts` |
| Nonces uniques, versions, rotation | `crypto.test.ts`, `VaultApiTest::test_key_rotation…`, e2e |
| IDOR, CSRF, rate limiting | `test_user_cannot_revoke_another_users_device`, test réel CSRF (419), `test_login_attempts_are_rate_limited_per_email` |
| Aucun secret dans localStorage ni sessionStorage | `App.test.tsx`, `client.test.ts` |
| Verrouillage, reprise de session | `App.test.tsx` (session sans clés → écran de déverrouillage) |

## 3. Vérifications manuelles réelles
- Serveur réel : installation, cookie CSRF, refus sans jeton (419), code par email, cookies `HttpOnly` et `SameSite=Strict`, connexion sur appareil connu sans code, nouvel appareil avec code. OK.
- Application servie par Laravel (`build-release.sh`) : CSP dédiée, assets, `sw.js` et manifeste servis. OK.
- Sauvegarde (`backup.sh`) et restauration dans une base vierge : 19 tables et données identiques, sommes SHA-256 OK.

## 4. Problèmes détectés et corrigés pendant la recette
1. Ordre des clés JSON réordonné par MySQL : il révélait l'existence d'un compte au prélogin. Corrigé et testé.
2. Limiteur de réauthentification partagé entre tous les utilisateurs. Remplacé par un limiteur par compte.
3. Requête API non connectée qui renvoyait une erreur 500 (redirection vers une route `login` inexistante). Elle renvoie maintenant un 401 JSON.
4. MariaDB WAMP en MyISAM par défaut. InnoDB est imposé.
5. Nettoyage incomplet après le test e2e (base et pièces jointes). Corrigé.

## 5. Non vérifié — à faire avant toute donnée réelle
- **Parcours visuel complet dans un vrai navigateur** (Chrome, Firefox, Edge, mobile Android/iOS), avec contrôle des contrastes, de la navigation au clavier et de l'installation PWA. Les écrans sont testés par composant et la logique de bout en bout, mais aucun outil de navigateur automatisé n'était disponible ici.
- **Calibrage Argon2id sur les téléphones cibles** : 64 Mio et 3 passes prennent environ 0,4 s sur PC. Il faut mesurer sur un mobile d'entrée de gamme.
- **Déploiement Hostinger réel** (docs/11), envoi SMTP réel, en-têtes Apache et HTTPS.
- **Audit de sécurité indépendant**, avec SAST et DAST (doc 03). KOFFRA ne doit pas être présenté comme inviolable ni certifié.
- Palette : valeurs de travail. Le vert du logo (≈ `#45D12E`) diffère de `#79C143`, à confirmer. Un logo SVG vectoriel reste à fournir.

## 6. Remarque de configuration
Le `backend/.env` de développement pointe actuellement vers le **SMTP Hostinger réel** : les codes de vérification sont donc réellement envoyés. Le script e2e force l'écriture des emails dans `storage/logs/mail-dev.log` pour ses propres tests.
