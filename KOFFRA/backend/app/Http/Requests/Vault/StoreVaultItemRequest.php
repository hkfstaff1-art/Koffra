<?php

namespace App\Http\Requests\Vault;

use App\Http\Requests\ApiRequest;

class StoreVaultItemRequest extends ApiRequest
{
    public const MAX_PAYLOAD_CHARS = 700_000; // ≈ 512 Kio de contenu chiffré

    public function rules(): array
    {
        return [
            // UUID généré par le navigateur : il figure dans les données associées du chiffrement
            'uuid' => ['required', 'uuid', 'unique:vault_items,uuid'],
            'category_uuid' => ['nullable', 'uuid', 'exists:categories,uuid'],
            'key_version' => ['required', 'integer', 'min:1'],
            'favorite' => ['sometimes', 'boolean'],
            ...$this->envelopeRules('payload', self::MAX_PAYLOAD_CHARS),
        ];
    }
}
