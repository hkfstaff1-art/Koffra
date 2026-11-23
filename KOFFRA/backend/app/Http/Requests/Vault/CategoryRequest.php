<?php

namespace App\Http\Requests\Vault;

use App\Http\Requests\ApiRequest;

class CategoryRequest extends ApiRequest
{
    public function rules(): array
    {
        $creating = $this->isMethod('post');

        return [
            'uuid' => $creating ? ['required', 'uuid', 'unique:categories,uuid'] : ['prohibited'],
            'key_version' => [$creating ? 'required' : 'required_with:name', 'integer', 'min:1'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:10000'],
            ...($creating || $this->has('name') ? $this->envelopeRules('name', 2000) : []),
        ];
    }
}
