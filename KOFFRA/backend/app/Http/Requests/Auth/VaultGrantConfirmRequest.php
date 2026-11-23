<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class VaultGrantConfirmRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'key_version' => ['required', 'integer', 'min:1'],
            ...$this->envelopeRules('encrypted_key', 200),
        ];
    }
}
