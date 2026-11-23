<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class SetupCompleteRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'regex:/^[0-9]{'.config('koffra.otp.length').'}$/'],
            'device_label' => $this->deviceLabelRules(),
            ...$this->accountMaterialRules(),
            ...$this->envelopeRules('vault_key', 200),
        ];
    }
}
