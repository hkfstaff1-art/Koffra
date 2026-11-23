<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class PreloginRequest extends ApiRequest
{
    public function rules(): array
    {
        return ['email' => $this->emailRules()];
    }
}
