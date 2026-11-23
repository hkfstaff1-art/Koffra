<?php

namespace Database\Factories;

use App\Models\Category;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Category> */
class CategoryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name_ciphertext' => UserFactory::b64(random_bytes(40)),
            'name_nonce' => UserFactory::b64(random_bytes(24)),
            'crypto_version' => 1,
            'key_version' => 1,
            'icon' => 'folder',
            'sort_order' => 0,
        ];
    }
}
