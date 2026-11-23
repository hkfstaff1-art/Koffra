# KOFFRA — Modèle de données implémenté et écarts justifiés

Référence : `docs/05-modele-donnees.md`. Migrations : `backend/database/migrations/`.
Moteur InnoDB imposé. Testé sur MySQL 8.4 et MariaDB 11.4 (Hostinger).

## Tables

| Table | Rôle |
|---|---|
| `users` | Admins (5 max). `password` = Argon2id de l'authKey. Matériel crypto : `kdf_params`, `encrypted_user_key`, `public_key`, `encrypted_private_key` |
| `sessions` | Sessions Laravel (cookie HttpOnly) |
| `trusted_devices` | Appareils approuvés ; `device_token_hash` = SHA-256 d'un jeton aléatoire en cookie |
| `otp_challenges` | Codes OTP hachés, expiration, tentatives, consommation |
| `installation_tokens` | Jeton unique d'initialisation du premier propriétaire |
| `invitations` | Invitations d'admins (jeton haché, expiration, révocation) |
| `recovery_records` | Empreinte de la clé de récupération, vérificateur haché, userKey enveloppée |
| `vault_keys` | Versions de la clé du coffre (rotation) |
| `vault_key_grants` | Enveloppes de la clé du coffre par admin (`confirmed` / `sealed`) |
| `categories` | Catégories : nom chiffré |
| `vault_items` | Entrées : `ciphertext`, `nonce`, versions, favori, archivage, corbeille, `revision` |
| `attachments` | Pièces jointes chiffrées : clé de stockage, taille, SHA-256 du ciphertext |
| `activity_logs` | Journal en ajout seul (modèle refusant update/delete) |
| `cache`, `jobs`… | Tables techniques Laravel |

## Écarts par rapport à la doc 05

| Écart | Justification |
|---|---|
| Pas de `user_id` sur `vault_items` et `categories`, remplacé par `created_by` / `updated_by` | Coffre **partagé** entre admins (décision validée) |
| Ajout de `vault_keys` et `vault_key_grants` | Nécessaires au partage chiffré de bout en bout (docs/09) |
| `users.phone` / `phone_verified_at` non créés | OTP par **email uniquement** (décision validée). Ajout possible plus tard par migration. |
| `users.password_hash` → `password` | Convention Laravel. Contient le hachage de l'authKey, jamais le mot de passe. |
| `device_fingerprint_hash` → `device_token_hash` | Jeton aléatoire en cookie HttpOnly plutôt qu'empreinte du navigateur : plus fiable et plus respectueux de la vie privée |
| `title_ciphertext` absent | Titre, type et champs dans le `ciphertext` unique de l'entrée |
| `categories.name` → `name_ciphertext` + `name_nonce` | La doc 05 demande d'évaluer la sensibilité des noms : ils sont chiffrés |
| `attachments.mime_type` absent ; `checksum_ciphertext` → `ciphertext_sha256` | Le type MIME révèle de l'information : il va dans le payload chiffré. Le SHA-256 du ciphertext contrôle l'intégrité du stockage. |
| `activity_logs.ip_hash_or_truncated` → `ip_truncated` | IP tronquée (/24 en IPv4, /48 en IPv6) |
| Tables `password_reset_tokens` et `remember_token` supprimées | Réinitialisation serveur impossible en chiffrement de bout en bout : on récupère avec la clé de récupération. Pas de « se souvenir de moi ». |
| `password_reset_requests` (doc 02) non créée | Même raison. Le flux de récupération passe par `recovery_records`. |
| Ajout de `installation_tokens` et `invitations` | Installation sécurisée du propriétaire et invitation d'admins (doc 01 §2) |
| Ajout de `vault_items.revision` | Deux admins qui modifient la même entrée : la seconde écriture est refusée, pas d'écrasement silencieux |
| Ajout de `vault_items.archived_at` | Archivage demandé (doc 01 §4) |

## Données de démonstration
Aucun seeder ne crée de compte : les clés naissent dans le navigateur. Les factories de test utilisent du matériel cryptographique **factice** (octets aléatoires).
