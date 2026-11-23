<?php

namespace Database\Factories;

use App\Models\VaultItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/** Entrées de test : ciphertext FACTICE (octets aléatoires), aucun contenu réel. @extends Factory<VaultItem> */
class VaultItemFactory extends Factory
{
    public function definition(): array
    {
        return [
            'ciphertext' => UserFactory::b64(random_bytes(200)),
            'nonce' => UserFactory::b64(random_bytes(24)),
            'crypto_version' => 1,
            'key_version' => 1,
            'favorite' => false,
        ];
    }
}
