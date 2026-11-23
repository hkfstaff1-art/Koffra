<?php

namespace Tests\Concerns;

use App\Mail\OtpCodeMail;
use App\Models\User;
use App\Models\VaultKey;
use App\Models\VaultKeyGrant;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;

/**
 * Simule un navigateur : conserve les cookies (session, appareil) entre les requêtes
 * et envoie l'en-tête Referer attendu par Sanctum pour l'authentification SPA.
 */
trait InteractsWithKoffraApi
{
    /** @var array<string, string> */
    protected array $browserCookies = [];

    protected function api(string $method, string $uri, array $data = []): TestResponse
    {
        // Chaque requête repart de zéro côté serveur, comme avec un vrai navigateur :
        // garde d'authentification et session rechargés depuis le cookie uniquement.
        $this->app['auth']->forgetGuards();
        $this->app['session']->forgetDrivers();
        $this->app->forgetInstance('session.store');
        $this->withCredentials();

        $this->defaultCookies = [];
        foreach ($this->browserCookies as $name => $value) {
            $this->withCookie($name, $value);
        }

        $response = $this->withHeaders(['Referer' => 'http://localhost/', 'Accept' => 'application/json'])
            ->json($method, '/api/v1'.$uri, $data);

        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->isCleared() || $cookie->getValue() === null) {
                unset($this->browserCookies[$cookie->getName()]);
            } else {
                $this->browserCookies[$cookie->getName()] = (string) $response->getCookie($cookie->getName(), true, false)?->getValue();
            }
        }

        return $response;
    }

    /** Nouveau navigateur : aucun cookie (ni session, ni appareil). */
    protected function newBrowser(): void
    {
        $this->browserCookies = [];
    }

    protected static function b64(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    protected static function envelope(): array
    {
        return ['v' => 1, 'n' => self::b64(24), 'c' => self::b64(48)];
    }

    /** Matériel de compte au format exact produit par le navigateur (valeurs factices). */
    protected static function accountMaterial(?string $authKey = null): array
    {
        return [
            'auth_key' => $authKey ?? self::b64(32),
            'public_key' => self::b64(32),
            'kdf_params' => ['alg' => 'argon2id13', 'ops' => 3, 'mem' => 67108864, 'salt' => self::b64(16)],
            'encrypted_user_key' => self::envelope(),
            'encrypted_private_key' => self::envelope(),
            'recovery' => [
                'auth_key' => self::b64(32),
                'encrypted_user_key' => self::envelope(),
                'fingerprint' => bin2hex(random_bytes(16)),
            ],
        ];
    }

    /** Crée un admin ayant accès au coffre (version 1). Son authKey est connue du test. */
    protected function createAdmin(string $authKey, array $attributes = []): User
    {
        $user = User::factory()->create(['password' => $authKey, ...$attributes]);
        VaultKey::firstOrCreate(['version' => 1], ['status' => VaultKey::STATUS_ACTIVE]);
        VaultKeyGrant::create([
            'user_id' => $user->id, 'key_version' => 1, 'type' => VaultKeyGrant::TYPE_CONFIRMED,
            'encrypted_key' => json_encode(self::envelope()),
        ]);

        return $user;
    }

    /** Dernier code OTP envoyé par email (Mail::fake requis). */
    protected function lastOtpCode(): string
    {
        $mail = Mail::sent(OtpCodeMail::class)->last();
        $this->assertNotNull($mail, 'Aucun code OTP envoyé');

        return $mail->code;
    }

    /** Connexion complète sur un nouvel appareil (mot de passe + OTP). */
    protected function loginWithOtp(User $user, string $authKey, string $device = 'PC test'): TestResponse
    {
        $login = $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => $authKey, 'device_label' => $device])
            ->assertStatus(202);

        return $this->api('POST', '/auth/otp/verify', ['challenge' => $login->json('challenge'), 'code' => $this->lastOtpCode()])
            ->assertOk();
    }
}
