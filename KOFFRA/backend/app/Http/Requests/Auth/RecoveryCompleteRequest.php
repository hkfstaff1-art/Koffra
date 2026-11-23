<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class RecoveryCompleteRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'device_label' => $this->deviceLabelRules(),
            ...$this->passwordMaterialRules(),
            ...$this->recoveryMaterialRules(),
        ];
    }
}
