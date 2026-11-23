<?php

namespace App\Services;

use App\Models\Invitation;
use App\Models\RecoveryRecord;
use App\Models\User;
use App\Models\VaultKey;
use App\Models\VaultKeyGrant;
use Illuminate\Support\Facades\Hash;

/** Opérations sur les comptes et leur matériel cryptographique (aucun secret en clair). */
class AccountService
{
    /** Paramètres KDF pour un email : réels si le compte existe, factices et stables sinon. */
    public function kdfParamsFor(string $email): array
    {
        $user = User::where('email', mb_strtolower($email))->first();
        if ($user !== null && $user->isActive()) {
            // Ordre des clés fixe : MySQL réordonne le JSON stocké, ce qui distinguerait
            // une réponse réelle d'une réponse factice (énumération de comptes).
            $p = $user->kdf_params;

            return ['alg' => $p['alg'], 'ops' => (int) $p['ops'], 'mem' => (int) $p['mem'], 'salt' => $p['salt']];
        }

        $salt = substr(hash_hmac('sha256', 'kdf-decoy|'.mb_strtolower($email), (string) config('app.key'), true), 0, 16);

        return [
            'alg' => 'argon2id13',
            'ops' => (int) config('koffra.kdf.default_ops'),
            'mem' => (int) config('koffra.kdf.default_mem'),
            'salt' => rtrim(strtr(base64_encode($salt), '+/', '-_'), '='),
        ];
    }

    /**
     * Vérifie l'authKey d'un email. Temps de réponse homogène : un hachage est
     * vérifié même si le compte n'existe pas (pas d'énumération par chronométrage).
     */
    public function attempt(string $email, string $authKey): ?User
    {
        $user = User::where('email', mb_strtolower($email))->first();
        $hash = $user?->getAuthPassword() ?? $this->dummyHash();
        $valid = Hash::check($authKey, $hash);

        return ($valid && $user !== null && $user->isActive()) ? $user : null;
    }

    public function countSeats(): int
    {
        $active = User::where('status', User::STATUS_ACTIVE)->count();
        $pending = Invitation::whereNull('accepted_at')->whereNull('revoked_at')->where('expires_at', '>', now())->count();

        return $active + $pending;
    }

    public function hasFreeSeat(): bool
    {
        return $this->countSeats() < (int) config('koffra.max_accounts');
    }

    /** Crée un compte à partir du matériel généré par le navigateur. */
    public function createUser(array $data, ?User $inviter = null): User
    {
        $user = new User([
            'name' => $data['name'],
            'email' => mb_strtolower($data['email']),
            'email_verified_at' => now(),
            'password' => $data['auth_key'],
            'kdf_params' => $data['kdf_params'],
            'encrypted_user_key' => $data['encrypted_user_key'],
            'public_key' => $data['public_key'],
            'encrypted_private_key' => $data['encrypted_private_key'],
            'invited_by' => $inviter?->id,
        ]);
        // UUID attribué avant la génération des clés (il figure dans les données associées)
        $user->uuid = $data['uuid'];
        $user->save();

        $this->storeRecovery($user, $data['recovery']);

        return $user;
    }

    /** Enregistre une nouvelle clé de récupération et révoque les précédentes. */
    public function storeRecovery(User $user, array $recovery): RecoveryRecord
    {
        $user->recoveryRecords()->whereNull('revoked_at')->update(['revoked_at' => now()]);

        return RecoveryRecord::create([
            'user_id' => $user->id,
            'recovery_key_fingerprint' => $recovery['fingerprint'],
            'auth_hash' => Hash::make($recovery['auth_key']),
            'encrypted_user_key' => $recovery['encrypted_user_key'],
        ]);
    }

    public function updatePassword(User $user, array $data): void
    {
        $user->forceFill([
            'password' => $data['auth_key'],
            'kdf_params' => $data['kdf_params'],
            'encrypted_user_key' => $data['encrypted_user_key'],
        ])->save();
    }

    /** Matériel nécessaire au navigateur pour déverrouiller le compte et le coffre. */
    public function keyMaterial(User $user): array
    {
        $current = VaultKey::current();

        return [
            'kdf_params' => $user->kdf_params,
            'encrypted_user_key' => $user->encrypted_user_key,
            'public_key' => $user->public_key,
            'encrypted_private_key' => $user->encrypted_private_key,
            'current_vault_key_version' => $current?->version,
            'vault_key_grants' => $user->vaultKeyGrants()
                ->orderBy('key_version')
                ->get(['key_version', 'type', 'encrypted_key'])
                ->map(fn (VaultKeyGrant $g) => [
                    'key_version' => $g->key_version,
                    'type' => $g->type,
                    'encrypted_key' => $g->type === VaultKeyGrant::TYPE_CONFIRMED ? json_decode($g->encrypted_key, true) : $g->encrypted_key,
                ])->all(),
        ];
    }

    private function dummyHash(): string
    {
        static $hash = null;

        return $hash ??= Hash::make('koffra-dummy-auth-key-for-timing');
    }
}
