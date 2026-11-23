<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\SetupCompleteRequest;
use App\Http\Requests\Auth\SetupStartRequest;
use App\Mail\OtpCodeMail;
use App\Models\InstallationToken;
use App\Models\User;
use App\Models\VaultKey;
use App\Models\VaultKeyGrant;
use App\Services\AccountService;
use App\Services\AuthSessionService;
use App\Services\DeviceService;
use App\Support\Ip;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Initialisation du premier propriétaire. Pas d'inscription publique : il faut le jeton
 * à usage unique produit par `php artisan koffra:install` ET un code envoyé à l'email saisi.
 */
class SetupController extends Controller
{
    public function __construct(
        private readonly AccountService $accounts,
        private readonly DeviceService $devices,
        private readonly AuthSessionService $sessions,
    ) {}

    public function status(): JsonResponse
    {
        return response()->json(['installed' => User::exists()]);
    }

    public function start(SetupStartRequest $request): JsonResponse
    {
        $token = $this->validToken($request->validated('token'));
        if ($token === null) {
            return $this->invalidToken();
        }

        $length = (int) config('koffra.otp.length');
        $code = str_pad((string) random_int(0, 10 ** $length - 1), $length, '0', STR_PAD_LEFT);
        $userUuid = (string) Str::uuid();
        $email = mb_strtolower($request->validated('email'));

        // État d'installation conservé en session serveur (chiffrée) : jamais le code en clair.
        $request->session()->put('setup', [
            'token_id' => $token->id,
            'name' => $request->validated('name'),
            'email' => $email,
            'user_uuid' => $userUuid,
            'code_hash' => hash_hmac('sha256', $userUuid.'|'.$code, (string) config('app.key')),
            'expires_at' => now()->addMinutes((int) config('koffra.otp.ttl_minutes'))->timestamp,
            'attempts' => 0,
        ]);

        Mail::to($email)->send(new OtpCodeMail($request->validated('name'), $code, (int) config('koffra.otp.ttl_minutes'), 'setup'));

        return response()->json([
            'user_uuid' => $userUuid,
            'destination' => Ip::maskEmail($email),
            'kdf_defaults' => ['ops' => (int) config('koffra.kdf.default_ops'), 'mem' => (int) config('koffra.kdf.default_mem')],
        ]);
    }

    public function complete(SetupCompleteRequest $request): JsonResponse
    {
        $setup = $request->session()->get('setup');
        if (! is_array($setup) || $setup['expires_at'] < now()->timestamp || $setup['attempts'] >= (int) config('koffra.otp.max_attempts')) {
            $request->session()->forget('setup');

            return response()->json(['message' => 'Procédure expirée : recommencez l’initialisation.', 'code' => 'setup_expired'], 422);
        }

        $setup['attempts']++;
        $request->session()->put('setup', $setup);

        $expected = hash_hmac('sha256', $setup['user_uuid'].'|'.$request->validated('code'), (string) config('app.key'));
        if (! hash_equals($setup['code_hash'], $expected)) {
            return response()->json(['message' => 'Code invalide.', 'code' => 'otp_invalid'], 422);
        }

        $data = $request->validated();

        $result = DB::transaction(function () use ($setup, $data, $request) {
            // Re-vérification sous verrou : un seul propriétaire, jeton à usage unique.
            $token = InstallationToken::whereKey($setup['token_id'])->lockForUpdate()->first();
            if ($token === null || $token->used_at !== null || $token->expires_at->isPast() || User::exists()) {
                return null;
            }
            $token->forceFill(['used_at' => now()])->save();

            $user = $this->accounts->createUser([
                ...$data,
                'uuid' => $setup['user_uuid'],
                'name' => $setup['name'],
                'email' => $setup['email'],
            ]);

            VaultKey::create(['version' => 1, 'status' => VaultKey::STATUS_ACTIVE, 'created_by' => $user->id]);
            VaultKeyGrant::create([
                'user_id' => $user->id,
                'key_version' => 1,
                'type' => VaultKeyGrant::TYPE_CONFIRMED,
                'encrypted_key' => json_encode($data['vault_key']),
                'granted_by' => $user->id,
            ]);

            [$device, $deviceToken] = $this->devices->createPending($user, $data['device_label'], $request);
            $this->devices->approve($device, $request);

            return [$user, $device, $deviceToken];
        });

        if ($result === null) {
            $request->session()->forget('setup');

            return $this->invalidToken();
        }

        [$user, $device, $deviceToken] = $result;

        return $this->sessions->open($request, $user, $device, $deviceToken, 'setup.owner_created', 201);
    }

    private function validToken(string $plain): ?InstallationToken
    {
        if (User::exists()) {
            return null;
        }

        $token = InstallationToken::where('token_hash', hash('sha256', $plain))->first();

        return ($token && $token->used_at === null && $token->expires_at->isFuture()) ? $token : null;
    }

    private function invalidToken(): JsonResponse
    {
        return response()->json([
            'message' => 'Lien d’initialisation invalide, expiré ou déjà utilisé.',
            'code' => 'setup_token_invalid',
        ], 422);
    }
}
