<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\KeyMaterialRules;
use Illuminate\Foundation\Http\FormRequest;

/** Base des requêtes de l'API : l'autorisation fine est faite par les middlewares et Policies. */
abstract class ApiRequest extends FormRequest
{
    use KeyMaterialRules;

    public function authorize(): bool
    {
        return true;
    }

    protected function emailRules(): array
    {
        return ['required', 'string', 'email:rfc', 'max:190'];
    }

    protected function otpRules(): array
    {
        return [
            'challenge' => ['required', 'uuid'],
            'code' => ['required', 'string', 'regex:/^[0-9]{'.config('koffra.otp.length').'}$/'],
        ];
    }
}
