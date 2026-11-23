<?php

namespace Tests\Feature;

use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\RecoveryRecord;
use App\Models\User;
use App\Models\VaultKeyGrant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\InteractsWithKoffraApi;
use Tests\TestCase;

class AdminSecurityFlowsTest extends TestCase
{
    use InteractsWithKoffraApi, RefreshDatabase;

    private string $key;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['session.driver' => 'database']);
        Mail::fake();
        $this->key = self::b64(32);
        $this->owner = $this->createAdmin($this->key, ['name' => 'Propriétaire']);
        $this->loginWithOtp($this->owner, $this->key);
    }

    private function reauth(): void
    {
        $this->api('POST', '/auth/reauth', ['auth_key' => $this->key])->assertOk();
    }

    private function invite(string $email): string
    {
        $this->reauth();
        $this->api('POST', '/invitations', ['email' => $email])->assertCreated();
        $mail = Mail::sent(InvitationMail::class)->last();
        preg_match('/invitation#([A-Za-z0-9_-]{43})/', $mail->acceptUrl, $m);

        return $m[1];
    }

    public function test_sensitive_actions_require_a_recent_reauthentication(): void
    {
        $this->api('POST', '/invitations', ['email' => 'x@example.test'])->assertForbidden()->assertJson(['code' => 'reauth_required']);

        $this->api('POST', '/auth/reauth', ['auth_key' => self::b64(32)])->assertStatus(422);
        $this->api('POST', '/invitations', ['email' => 'x@example.test'])->assertForbidden();

        $this->reauth();
        $this->api('POST', '/invitations', ['email' => 'x@example.test'])->assertCreated();

        // La réauthentification est consommée par l'action sensible
        $this->api('POST', '/invitations', ['email' => 'y@example.test'])->assertForbidden();

        // et expire après 5 minutes
        $this->reauth();
        $this->travel(6)->minutes();
        $this->api('POST', '/invitations', ['email' => 'y@example.test'])->assertForbidden();
    }

    public function test_account_limit_of_five_includes_pending_invitations(): void
    {
        foreach (['a', 'b', 'c', 'd'] as $n) {
            $this->invite("$n@example.test");
        }
        $this->reauth();
        $this->api('POST', '/invitations', ['email' => 'e@example.test'])->assertStatus(422)->assertJson(['code' => 'seat_limit']);

        // Annuler une invitation libère une place
        $uuid = Invitation::where('email', 'a@example.test')->value('uuid');
        $this->reauth();
        $this->api('DELETE', '/invitations/'.$uuid)->assertOk();
        $this->invite('e@example.test');
    }

    public function test_cannot_invite_an_existing_account(): void
    {
        $this->reauth();
        $this->api('POST', '/invitations', ['email' => $this->owner->email])->assertStatus(422)->assertJson(['code' => 'email_taken']);
    }

    public function test_invitation_then_out_of_band_vault_sharing_and_confirmation(): void
    {
        $token = $this->invite('nouvel.admin@example.test');
        $ownerCookies = $this->browserCookies;

        // L'invité ouvre le lien dans son navigateur
        $this->newBrowser();
        $start = $this->api('POST', '/invitations/accept/start', ['token' => $token])->assertOk()
            ->assertJson(['email' => 'nouvel.admin@example.test', 'invited_by' => 'Propriétaire']);

        $material = self::accountMaterial();
        $accepted = $this->api('POST', '/invitations/accept', [...$material, 'name' => 'Nouvel admin', 'device_label' => 'Portable'])
            ->assertCreated()
            ->assertJsonPath('user.uuid', $start->json('user_uuid'))
            ->assertJsonPath('keys.vault_key_grants', []); // pas encore d'accès au coffre
        $invitee = User::where('uuid', $accepted->json('user.uuid'))->firstOrFail();
        $inviteeCookies = $this->browserCookies;

        // Le lien ne peut pas être réutilisé
        $this->newBrowser();
        $this->api('POST', '/invitations/accept/start', ['token' => $token])->assertStatus(422);

        // Le propriétaire voit l'invité sans accès, puis lui scelle la clé du coffre
        $this->browserCookies = $ownerCookies;
        $admins = collect($this->api('GET', '/admins')->assertOk()->json('data'))->keyBy('uuid');
        $this->assertSame('none', $admins[$invitee->uuid]['vault_access']);
        $this->assertSame($material['public_key'], $admins[$invitee->uuid]['public_key']); // pour l'empreinte

        $this->api('POST', "/admins/{$invitee->uuid}/vault-grant", ['key_version' => 1, 'sealed_key' => self::b64(84)])->assertForbidden();
        $this->reauth();
        $this->api('POST', "/admins/{$invitee->uuid}/vault-grant", ['key_version' => 1, 'sealed_key' => self::b64(84)])->assertCreated();

        // L'invité reçoit l'accès scellé et le confirme
        $this->browserCookies = $inviteeCookies;
        $this->api('GET', '/me')->assertOk()->assertJsonPath('keys.vault_key_grants.0.type', 'sealed');
        $this->api('POST', '/vault-grants/confirm', ['key_version' => 1, 'encrypted_key' => self::envelope()])->assertOk();
        $this->api('POST', '/vault-grants/confirm', ['key_version' => 1, 'encrypted_key' => self::envelope()])->assertStatus(422);

        $this->assertSame(['confirmed'], VaultKeyGrant::where('user_id', $invitee->id)->pluck('type')->all());
    }

    public function test_disabling_an_admin_cuts_access_immediately(): void
    {
        $otherKey = self::b64(32);
        $other = $this->createAdmin($otherKey);
        $ownerCookies = $this->browserCookies;

        $this->newBrowser();
        $this->loginWithOtp($other, $otherKey, 'Portable autre');
        $otherCookies = $this->browserCookies;

        $this->browserCookies = $ownerCookies;
        $this->reauth();
        $this->api('DELETE', '/admins/'.$this->owner->uuid)->assertStatus(422); // pas soi-même
        $this->reauth();
        $this->api('DELETE', '/admins/'.$other->uuid)->assertOk()->assertJson(['rotation_recommended' => true]);

        $this->browserCookies = $otherCookies;
        $this->api('GET', '/me')->assertUnauthorized();
        $this->assertSame(0, VaultKeyGrant::where('user_id', $other->id)->count());
        $this->assertSame(User::STATUS_DISABLED, $other->fresh()->status);
    }

    public function test_password_change_replaces_auth_key_and_closes_other_sessions(): void
    {
        $ownerCookies = $this->browserCookies;
        $this->newBrowser();
        $this->loginWithOtp($this->owner, $this->key, 'Second appareil');
        $secondCookies = $this->browserCookies;

        $this->browserCookies = $ownerCookies;
        $newKey = self::b64(32);
        $material = self::accountMaterial($newKey);
        $payload = ['auth_key' => $newKey, 'kdf_params' => $material['kdf_params'], 'encrypted_user_key' => $material['encrypted_user_key']];

        $this->api('PUT', '/me/password', $payload)->assertForbidden();
        $this->reauth();
        $this->api('PUT', '/me/password', $payload)->assertOk();
        $this->api('GET', '/me')->assertOk(); // session courante conservée

        $this->browserCookies = $secondCookies;
        $this->api('GET', '/me')->assertUnauthorized(); // autre session fermée

        $this->newBrowser();
        $this->api('POST', '/auth/login', ['email' => $this->owner->email, 'auth_key' => $this->key, 'device_label' => 'PC'])->assertStatus(422);
        $this->api('POST', '/auth/login', ['email' => $this->owner->email, 'auth_key' => $newKey, 'device_label' => 'PC'])->assertStatus(202);
    }

    public function test_recovery_with_recovery_key_and_email_code(): void
    {
        $recoveryAuth = self::b64(32);
        $this->reauth();
        $this->api('POST', '/me/recovery-key', ['recovery' => [
            'auth_key' => $recoveryAuth, 'encrypted_user_key' => self::envelope(), 'fingerprint' => bin2hex(random_bytes(16)),
        ]])->assertOk();

        $this->newBrowser();
        Mail::fake();

        // Mauvaise clé : réponse générique, aucun email
        $bad = $this->api('POST', '/recovery/start', ['email' => $this->owner->email, 'recovery_auth_key' => self::b64(32)])->assertStatus(202);
        Mail::assertNothingSent();

        $good = $this->api('POST', '/recovery/start', ['email' => $this->owner->email, 'recovery_auth_key' => $recoveryAuth])->assertStatus(202);
        $this->assertSame(array_keys($bad->json()), array_keys($good->json()));
        $this->assertSame($bad->json('message'), $good->json('message'));

        // Compléter sans code vérifié : refus
        $newKey = self::b64(32);
        $m = self::accountMaterial($newKey);
        $complete = ['auth_key' => $newKey, 'kdf_params' => $m['kdf_params'], 'encrypted_user_key' => $m['encrypted_user_key'], 'recovery' => $m['recovery'], 'device_label' => 'Nouveau PC'];
        $this->api('POST', '/recovery/complete', $complete)->assertStatus(422);

        $this->api('POST', '/recovery/verify', ['challenge' => $good->json('challenge'), 'code' => $this->lastOtpCode()])
            ->assertOk()->assertJsonPath('user_uuid', $this->owner->uuid)
            ->assertJsonStructure(['encrypted_user_key_by_recovery' => ['v', 'n', 'c'], 'public_key', 'encrypted_private_key']);

        $this->api('POST', '/recovery/complete', $complete)->assertOk()->assertCookie('koffra_device');
        $this->api('GET', '/me')->assertOk();

        // Ancienne clé révoquée, nouvelle active ; l'ancien mot de passe ne fonctionne plus
        $this->assertSame(1, RecoveryRecord::where('user_id', $this->owner->id)->whereNull('revoked_at')->count());
        $this->assertSame($m['recovery']['fingerprint'], $this->owner->activeRecoveryRecord()->recovery_key_fingerprint);
        $this->newBrowser();
        $this->api('POST', '/auth/login', ['email' => $this->owner->email, 'auth_key' => $this->key, 'device_label' => 'PC'])->assertStatus(422);
    }

    public function test_no_secret_value_is_stored_in_clear_in_database_or_logs(): void
    {
        $token = $this->invite('secret.check@example.test');
        $this->newBrowser();
        $this->api('POST', '/invitations/accept/start', ['token' => $token]);
        $authKey = self::b64(32);
        $material = self::accountMaterial($authKey);
        $this->api('POST', '/invitations/accept', [...$material, 'name' => 'Vérif', 'device_label' => 'PC'])->assertCreated();

        $this->newBrowser();
        Mail::fake();
        $this->api('POST', '/auth/login', ['email' => 'secret.check@example.test', 'auth_key' => $authKey, 'device_label' => 'Autre']);
        $otp = $this->lastOtpCode();

        $secrets = [$this->key, $authKey, $material['recovery']['auth_key'], $token, $otp];

        // Contenu intégral de toutes les tables
        $dump = '';
        foreach (DB::connection()->getSchemaBuilder()->getTableListing() as $table) {
            $table = str_contains($table, '.') ? substr($table, strrpos($table, '.') + 1) : $table;
            $dump .= json_encode(DB::table($table)->get());
        }
        $logs = File::exists(storage_path('logs/laravel.log')) ? File::get(storage_path('logs/laravel.log')) : '';

        foreach ($secrets as $secret) {
            $this->assertStringNotContainsString($secret, $dump);
            $this->assertStringNotContainsString($secret, $logs);
        }
        $this->assertStringNotContainsString('"'.$otp.'"', $dump);
    }
}
