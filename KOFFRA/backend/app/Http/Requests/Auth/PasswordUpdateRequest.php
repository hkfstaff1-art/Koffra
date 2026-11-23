<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class PasswordUpdateRequest extends ApiRequest
{
    public function rules(): array
    {
        return $this->passwordMaterialRules();
    }
}
