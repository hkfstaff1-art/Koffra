<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;

class OtpVerifyRequest extends ApiRequest
{
    public function rules(): array
    {
        return $this->otpRules();
    }
}
