<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class InvitationStoreRequest extends ApiRequest
{
    public function rules(): array
    {
        return ['email' => $this->emailRules()];
    }
}
