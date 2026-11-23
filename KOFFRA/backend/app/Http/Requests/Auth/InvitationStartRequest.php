<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class InvitationStartRequest extends ApiRequest
{
    public function rules(): array
    {
        return ['token' => ['required', 'string', 'size:43', self::B64]];
    }
}
