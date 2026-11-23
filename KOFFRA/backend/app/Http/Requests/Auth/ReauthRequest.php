<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class ReauthRequest extends ApiRequest
{
    public function rules(): array
    {
        return ['auth_key' => $this->keyRules()];
    }
}
