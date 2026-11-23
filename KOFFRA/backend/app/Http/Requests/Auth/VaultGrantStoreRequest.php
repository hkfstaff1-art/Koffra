<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class VaultGrantStoreRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'key_version' => ['required', 'integer', 'min:1'],
            // sealed box de 36 octets (version + clé) → 84 octets → 112 caractères
            'sealed_key' => ['required', 'string', 'size:112', self::B64],
        ];
    }
}
