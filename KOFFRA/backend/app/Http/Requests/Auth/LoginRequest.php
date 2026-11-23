<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class LoginRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'email' => $this->emailRules(),
            'auth_key' => $this->keyRules(),
            'device_label' => $this->deviceLabelRules(),
        ];
    }
}
