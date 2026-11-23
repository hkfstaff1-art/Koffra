<?php

return [

    // Nombre maximal de comptes administrateurs (comptes actifs + invitations en cours).
    'max_accounts' => (int) env('KOFFRA_MAX_ACCOUNTS', 5),

    'otp' => [
        'ttl_minutes' => (int) env('KOFFRA_OTP_TTL', 5),
        'max_attempts' => 5,
        'length' => 6,
        // Délai minimal entre deux envois de code pour un même compte
        'resend_cooldown_seconds' => 60,
    ],

    'installation_token_ttl_minutes' => 30,
    'invitation_ttl_hours' => 72,

    'device' => [
        'cookie' => 'koffra_device',
        'cookie_days' => 180,
    ],

    // Paramètres Argon2id côté client (doivent rester alignés sur frontend/src/crypto/kdf.ts).
    // Pour un email inconnu, le serveur renvoie ces paramètres avec un sel factice déterministe.
    'kdf' => [
        'default_ops' => 3,
        'default_mem' => 64 * 1024 * 1024,
        'min_ops' => 2,
        'min_mem' => 19 * 1024 * 1024,
    ],

    // Pièces jointes chiffrées
    'attachments' => [
        'disk' => env('KOFFRA_ATTACHMENTS_DISK', 'local'),
        'max_bytes' => (int) env('KOFFRA_ATTACHMENT_MAX_BYTES', 10 * 1024 * 1024),
    ],
];
