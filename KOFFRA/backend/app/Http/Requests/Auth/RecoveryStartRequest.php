<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class RecoveryStartRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'email' => $this->emailRules(),
            'recovery_auth_key' => $this->keyRules(),
        ];
    }
}
