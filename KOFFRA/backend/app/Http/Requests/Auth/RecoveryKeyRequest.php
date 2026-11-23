<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class RecoveryKeyRequest extends ApiRequest
{
    public function rules(): array
    {
        return $this->recoveryMaterialRules();
    }
}
