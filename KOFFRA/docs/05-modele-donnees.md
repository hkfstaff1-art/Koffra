# KOFFRA — Modèle de données détaillé

Les secrets sont stockés dans `encrypted_payload` (JSON ou blob chiffré) et ne doivent pas être éclatés en colonnes en clair.

## Tables
### users
`id`, `uuid`, `name`, `email`, `phone`, `password_hash`, `email_verified_at`, `phone_verified_at`, `status`, `created_at`, `updated_at`.

### trusted_devices
`id`, `user_id`, `device_label`, `device_fingerprint_hash`, `approved_at`, `last_seen_at`, `revoked_at`, timestamps.

### otp_challenges
`id`, `user_id`, `destination_masked`, `channel`, `code_hash`, `expires_at`, `attempt_count`, `consumed_at`, timestamps. Jamais stocker le code OTP en clair.

### vault_items
`id`, `uuid`, `user_id`, `category_id`, `title_ciphertext` ou titre non sensible choisi explicitement, `encrypted_payload`, `nonce`, `crypto_version`, `key_version`, `favorite`, `created_at`, `updated_at`, `deleted_at`.

### categories
`id`, `user_id`, `name`, `icon`, `sort_order`, timestamps. Évaluer si le nom de catégorie révèle une information sensible.

### attachments
`id`, `vault_item_id`, `storage_key`, `encrypted_size`, `mime_type`, `checksum_ciphertext`, `crypto_version`, timestamps.

### activity_logs
`id`, `user_id`, `event_type`, `device_id`, `ip_hash_or_truncated`, `metadata_safe_json`, `created_at`. Aucune valeur secrète.

### recovery_records
`id`, `user_id`, `recovery_key_fingerprint`, `key_version`, `created_at`, `revoked_at`. Jamais la clé de récupération elle-même.

## Contraintes
- Clés étrangères et suppression logique contrôlée.
- Index sur `user_id`, `category_id`, `created_at`, `revoked_at`.
- UUID publics non prédictibles ; vérification d'autorisation même avec UUID.
- Migrations réversibles lorsque possible et factories/seeders sans secrets réels.
