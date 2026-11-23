<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class InvitationAcceptRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'device_label' => $this->deviceLabelRules(),
            ...$this->accountMaterialRules(),
        ];
    }
}
