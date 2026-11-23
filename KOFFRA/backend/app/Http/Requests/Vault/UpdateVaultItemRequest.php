<?php

namespace App\Http\Requests\Vault;

use App\Http\Requests\ApiRequest;

class UpdateVaultItemRequest extends ApiRequest
{
    public function rules(): array
    {
        $rules = [
            // Révision connue du client : refus (409) si un autre admin a modifié l'entrée entre-temps
            'revision' => ['required', 'integer', 'min:1'],
            'category_uuid' => ['sometimes', 'nullable', 'uuid', 'exists:categories,uuid'],
            'favorite' => ['sometimes', 'boolean'],
            'archived' => ['sometimes', 'boolean'],
            'key_version' => ['required_with:payload', 'integer', 'min:1'],
        ];

        if ($this->has('payload')) {
            $rules = [...$rules, ...$this->envelopeRules('payload', StoreVaultItemRequest::MAX_PAYLOAD_CHARS)];
        }

        return $rules;
    }
}
