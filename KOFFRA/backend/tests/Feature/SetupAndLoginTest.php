<?php

namespace Tests\Feature;

use App\Mail\OtpCodeMail;
use App\Models\ActivityLog;
use App\Models\InstallationToken;
use App\Models\RecoveryRecord;
use App\Models\TrustedDevice;
use App\Models\User;
use App\Models\VaultKeyGrant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\InteractsWithKoffraApi;
use Tests\TestCase;

class SetupAndLoginTest extends TestCase
{
    use InteractsWithKoffraApi, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['session.driver' => 'database']);
        Mail::fake();
    }

    private function installToken(): string
    {
        Artisan::call('koffra:install');
        preg_match('/installation#([A-Za-z0-9_-]{43})/', Artisan::output(), $m);
        $this->assertNotEmpty($m[1] ?? null, 'Lien d’installation absent');

        return $m[1];
    }

    public function test_owner_setup_requires_cli_token_and_email_code(): void
    {
        $this->api('GET', '/setup/status')->assertExactJson(['installed' => false]);
        $token = $this->installToken();

        // Jeton invalide → refus
        $this->api('POST', '/setup/start', ['token' => self::b64(32), 'name' => 'Propriétaire', 'email' => 'owner@example.test'])
            ->assertStatus(422)->assertJson(['code' => 'setup_token_invalid']);

        $start = $this->api('POST', '/setup/start', ['token' => $token, 'name' => 'Propriétaire', 'email' => 'Owner@Example.test'])
            ->assertOk()->assertJsonStructure(['user_uuid', 'destination', 'kdf_defaults']);
        $this->assertSame('o***@e***.test', $start->json('destination'));
        Mail::assertSent(OtpCodeMail::class, fn ($m) => $m->hasTo('owner@example.test'));

        $payload = [...self::accountMaterial(), 'vault_key' => self::envelope(), 'device_label' => 'PC du bureau'];

        // Mauvais code → refus
        $this->api('POST', '/setup/complete', [...$payload, 'code' => $this->lastOtpCode() === '000000' ? '111111' : '000000'])
            ->assertStatus(422)->assertJson(['code' => 'otp_invalid']);

        $response = $this->api('POST', '/setup/complete', [...$payload, 'code' => $this->lastOtpCode()])
            ->assertCreated()
            ->assertJsonPath('user.uuid', $start->json('user_uuid'))
            ->assertJsonPath('user.email', 'owner@example.test')
            ->assertJsonPath('keys.current_vault_key_version', 1)
            ->assertJsonPath('keys.vault_key_grants.0.type', 'confirmed');

        $response->assertCookie('koffra_device');
        $user = User::firstOrFail();
        $this->assertSame(1, RecoveryRecord::where('user_id', $user->id)->count());
        $this->assertTrue(TrustedDevice::firstOrFail()->isApproved());
        $this->assertNotNull(InstallationToken::firstOrFail()->used_at);

        $this->api('GET', '/me')->assertOk()->assertJsonPath('user.name', 'Propriétaire');
        $this->api('GET', '/setup/status')->assertExactJson(['installed' => true]);
    }

    public function test_setup_cannot_be_replayed_once_installed(): void
    {
        $token = $this->installToken();
        $this->createAdmin(self::b64(32));

        $this->api('POST', '/setup/start', ['token' => $token, 'name' => 'Pirate', 'email' => 'pirate@example.test'])
            ->assertStatus(422);

        $this->assertSame(1, Artisan::call('koffra:install'), 'La commande doit refuser une seconde installation');
    }

    public function test_setup_locks_after_too_many_wrong_codes(): void
    {
        $token = $this->installToken();
        $this->api('POST', '/setup/start', ['token' => $token, 'name' => 'Owner', 'email' => 'o@example.test'])->assertOk();
        $payload = [...self::accountMaterial(), 'vault_key' => self::envelope(), 'device_label' => 'PC'];
        $wrong = $this->lastOtpCode() === '123456' ? '654321' : '123456';

        for ($i = 0; $i < 5; $i++) {
            $this->api('POST', '/setup/complete', [...$payload, 'code' => $wrong])->assertStatus(422);
        }
        $this->api('POST', '/setup/complete', [...$payload, 'code' => $this->lastOtpCode()])
            ->assertStatus(422)->assertJson(['code' => 'setup_expired']);
        $this->assertSame(0, User::count());
    }

    public function test_prelogin_does_not_reveal_whether_an_account_exists(): void
    {
        $user = $this->createAdmin(self::b64(32));

        $real = $this->api('POST', '/auth/prelogin', ['email' => $user->email])->assertOk()->json('kdf_params');
        $fake1 = $this->api('POST', '/auth/prelogin', ['email' => 'inconnu@example.test'])->assertOk()->json('kdf_params');
        $fake2 = $this->api('POST', '/auth/prelogin', ['email' => 'INCONNU@example.test'])->json('kdf_params');
        $other = $this->api('POST', '/auth/prelogin', ['email' => 'autre@example.test'])->json('kdf_params');

        $this->assertEquals($user->kdf_params, $real);
        $this->assertSame(array_keys($real), array_keys($fake1));
        $this->assertSame(22, strlen($fake1['salt']));
        $this->assertSame($fake1, $fake2, 'Le sel factice doit être stable');
        $this->assertNotSame($fake1['salt'], $other['salt']);
    }

    public function test_wrong_credentials_get_the_same_generic_answer(): void
    {
        $user = $this->createAdmin(self::b64(32));

        $a = $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => self::b64(32), 'device_label' => 'PC'])->assertStatus(422);
        $b = $this->api('POST', '/auth/login', ['email' => 'nobody@example.test', 'auth_key' => self::b64(32), 'device_label' => 'PC'])->assertStatus(422);

        $this->assertSame($a->json(), $b->json());
        Mail::assertNothingSent();
        $this->assertSame(2, ActivityLog::where('event_type', 'auth.login_failed')->count());
    }

    public function test_new_device_requires_an_email_code_and_cannot_self_approve(): void
    {
        $key = self::b64(32);
        $user = $this->createAdmin($key);

        $login = $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => $key, 'device_label' => 'Téléphone'])
            ->assertStatus(202)->assertJson(['otp_required' => true]);
        Mail::assertSent(OtpCodeMail::class, fn ($m) => $m->hasTo($user->email));

        // Pas encore authentifié, appareil non approuvé
        $this->api('GET', '/me')->assertUnauthorized();
        $this->assertFalse(TrustedDevice::firstOrFail()->isApproved());

        // Un autre navigateur ne peut pas valider ce défi
        $code = $this->lastOtpCode();
        $cookies = $this->browserCookies;
        $this->newBrowser();
        $this->api('POST', '/auth/otp/verify', ['challenge' => $login->json('challenge'), 'code' => $code])->assertStatus(422);
        $this->browserCookies = $cookies;

        // Mauvais code
        $this->api('POST', '/auth/otp/verify', ['challenge' => $login->json('challenge'), 'code' => $code === '000000' ? '000001' : '000000'])
            ->assertStatus(422)->assertJsonPath('remaining_attempts', 4);

        $this->api('POST', '/auth/otp/verify', ['challenge' => $login->json('challenge'), 'code' => $code])
            ->assertOk()->assertJsonPath('user.uuid', $user->uuid)->assertCookie('koffra_device');

        $this->assertTrue(TrustedDevice::firstOrFail()->isApproved());
        $this->api('GET', '/me')->assertOk();
    }

    public function test_otp_cannot_be_reused_expires_and_locks_after_max_attempts(): void
    {
        $key = self::b64(32);
        $user = $this->createAdmin($key);

        // Réutilisation
        $login = $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => $key, 'device_label' => 'PC']);
        $code = $this->lastOtpCode();
        $this->api('POST', '/auth/otp/verify', ['challenge' => $login->json('challenge'), 'code' => $code])->assertOk();
        $this->api('POST', '/auth/logout')->assertOk();
        $this->api('POST', '/auth/otp/verify', ['challenge' => $login->json('challenge'), 'code' => $code])->assertStatus(422);

        // Expiration
        $this->newBrowser();
        $login = $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => $key, 'device_label' => 'PC2']);
        $this->travel(6)->minutes();
        $this->api('POST', '/auth/otp/verify', ['challenge' => $login->json('challenge'), 'code' => $this->lastOtpCode()])->assertStatus(422);
        $this->travelBack();

        // Tentatives épuisées : même le bon code est refusé
        $this->newBrowser();
        $login = $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => $key, 'device_label' => 'PC3']);
        $good = $this->lastOtpCode();
        $bad = $good === '999999' ? '999998' : '999999';
        for ($i = 0; $i < 5; $i++) {
            $this->api('POST', '/auth/otp/verify', ['challenge' => $login->json('challenge'), 'code' => $bad]);
        }
        $this->api('POST', '/auth/otp/verify', ['challenge' => $login->json('challenge'), 'code' => $good])->assertStatus(422);
    }

    public function test_approved_device_logs_in_without_code_and_logout_ends_session(): void
    {
        $key = self::b64(32);
        $user = $this->createAdmin($key);
        $this->loginWithOtp($user, $key);
        $this->api('POST', '/auth/logout')->assertOk();
        $this->api('GET', '/me')->assertUnauthorized();

        Mail::fake(); // remise à zéro
        $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => $key, 'device_label' => 'PC test'])
            ->assertOk()->assertJsonPath('user.uuid', $user->uuid);
        Mail::assertNothingSent();
    }

    public function test_revoked_device_is_rejected_on_next_request(): void
    {
        $key = self::b64(32);
        $user = $this->createAdmin($key);
        $this->loginWithOtp($user, $key);

        TrustedDevice::firstOrFail()->forceFill(['revoked_at' => now()])->save();

        $this->api('GET', '/me')->assertUnauthorized()->assertJson(['code' => 'session_revoked']);
    }

    public function test_login_attempts_are_rate_limited_per_email(): void
    {
        $user = $this->createAdmin(self::b64(32));

        for ($i = 0; $i < 5; $i++) {
            $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => self::b64(32), 'device_label' => 'PC'])->assertStatus(422);
        }
        $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => self::b64(32), 'device_label' => 'PC'])->assertStatus(429);
    }

    public function test_disabled_account_cannot_log_in(): void
    {
        $key = self::b64(32);
        $user = $this->createAdmin($key);
        $user->forceFill(['status' => User::STATUS_DISABLED])->save();

        $this->api('POST', '/auth/login', ['email' => $user->email, 'auth_key' => $key, 'device_label' => 'PC'])->assertStatus(422);
        Mail::assertNothingSent();
    }

    public function test_user_cannot_revoke_another_users_device(): void
    {
        $keyA = self::b64(32);
        $a = $this->createAdmin($keyA);
        $b = $this->createAdmin(self::b64(32));
        $deviceB = TrustedDevice::create(['user_id' => $b->id, 'device_label' => 'B', 'device_token_hash' => str_repeat('c', 64), 'approved_at' => now()]);

        $this->loginWithOtp($a, $keyA);

        $this->api('DELETE', '/devices/'.$deviceB->uuid)->assertNotFound();
        $this->assertNull($deviceB->fresh()->revoked_at);

        $mine = $this->api('GET', '/devices')->assertOk()->json('data');
        $this->assertCount(1, $mine);
        $this->assertTrue($mine[0]['current']);
    }

    public function test_me_exposes_key_material_but_never_hashes(): void
    {
        $key = self::b64(32);
        $user = $this->createAdmin($key);
        $me = $this->loginWithOtp($user, $key)->json();

        $this->assertSame($user->public_key, $me['keys']['public_key']);
        $json = json_encode($me);
        $this->assertStringNotContainsString('argon2id$', $json);
        $this->assertStringNotContainsString('"password"', $json);
        $this->assertStringNotContainsString('"id"', $json);
        $this->assertSame(1, VaultKeyGrant::count());
    }
}
