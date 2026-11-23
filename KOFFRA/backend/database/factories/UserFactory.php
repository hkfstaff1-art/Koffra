<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * Comptes de test. Le matériel cryptographique est FACTICE (octets aléatoires) :
 * il a la forme attendue mais ne protège aucune donnée réelle.
 *
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /** authKey factice partagée par les comptes de test (base64url de 32 octets). */
    public const TEST_AUTH_KEY = 'dGVzdC1hdXRoLWtleS1mYWN0aWNlLTMyLW9jdGV0cyE';

    protected static ?string $hashedAuthKey = null;

    public static function fakeEnvelope(): array
    {
        return ['v' => 1, 'n' => self::b64(random_bytes(24)), 'c' => self::b64(random_bytes(48))];
    }

    public static function b64(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$hashedAuthKey ??= Hash::make(self::TEST_AUTH_KEY),
            'kdf_params' => [
                'alg' => 'argon2id13',
                'ops' => 3,
                'mem' => 64 * 1024 * 1024,
                'salt' => self::b64(random_bytes(16)),
            ],
            'encrypted_user_key' => self::fakeEnvelope(),
            'public_key' => self::b64(random_bytes(32)),
            'encrypted_private_key' => self::fakeEnvelope(),
        ];
    }

    public function disabled(): static
    {
        return $this->state(fn () => ['status' => User::STATUS_DISABLED, 'disabled_at' => now()]);
    }
}
