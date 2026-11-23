<?php

namespace App\Http\Requests\Concerns;

/**
 * Règles de validation du matériel cryptographique (format seulement : le serveur ne peut
 * ni ne doit vérifier le contenu chiffré). Tailles alignées sur frontend/src/crypto.
 */
trait KeyMaterialRules
{
    /** base64url sans padding */
    protected const B64 = 'regex:/^[A-Za-z0-9_-]+$/';

    /** 32 octets → 43 caractères base64url */
    protected function keyRules(): array
    {
        return ['required', 'string', 'size:43', self::B64];
    }

    protected function envelopeRules(string $field, int $maxCipherChars = 4096): array
    {
        return [
            $field => ['required', 'array:v,n,c'],
            "$field.v" => ['required', 'integer', 'in:1'],
            "$field.n" => ['required', 'string', 'size:32', self::B64], // nonce 24 octets
            "$field.c" => ['required', 'string', 'min:22', "max:$maxCipherChars", self::B64],
        ];
    }

    protected function kdfRules(string $field): array
    {
        return [
            $field => ['required', 'array:alg,ops,mem,salt'],
            "$field.alg" => ['required', 'in:argon2id13'],
            "$field.ops" => ['required', 'integer', 'min:'.config('koffra.kdf.min_ops'), 'max:10'],
            "$field.mem" => ['required', 'integer', 'min:'.config('koffra.kdf.min_mem'), 'max:'.(1024 * 1024 * 1024)],
            "$field.salt" => ['required', 'string', 'size:22', self::B64], // sel 16 octets
        ];
    }

    /** Matériel complet d'un compte (création, invitation acceptée). */
    protected function accountMaterialRules(): array
    {
        return [
            'auth_key' => $this->keyRules(),
            'public_key' => $this->keyRules(),
            ...$this->kdfRules('kdf_params'),
            ...$this->envelopeRules('encrypted_user_key', 200),
            ...$this->envelopeRules('encrypted_private_key', 200),
            ...$this->recoveryMaterialRules(),
        ];
    }

    protected function recoveryMaterialRules(): array
    {
        return [
            'recovery' => ['required', 'array:auth_key,encrypted_user_key,fingerprint'],
            'recovery.auth_key' => $this->keyRules(),
            'recovery.fingerprint' => ['required', 'string', 'regex:/^[0-9a-f]{32}$/'],
            ...$this->envelopeRules('recovery.encrypted_user_key', 200),
        ];
    }

    protected function passwordMaterialRules(): array
    {
        return [
            'auth_key' => $this->keyRules(),
            ...$this->kdfRules('kdf_params'),
            ...$this->envelopeRules('encrypted_user_key', 200),
        ];
    }

    protected function deviceLabelRules(): array
    {
        return ['required', 'string', 'min:2', 'max:120'];
    }
}
