<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class SetupStartRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'size:43', self::B64],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => $this->emailRules(),
        ];
    }
}
