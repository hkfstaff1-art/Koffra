<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\OtpVerifyRequest;
use App\Http\Requests\Auth\RecoveryCompleteRequest;
use App\Http\Requests\Auth\RecoveryStartRequest;
use App\Models\OtpChallenge;
use App\Models\RecoveryRecord;
use App\Models\User;
use App\Services\AccountService;
use App\Services\ActivityLogger;
use App\Services\AuthSessionService;
use App\Services\DeviceService;
use App\Services\OtpService;
use App\Support\Ip;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Récupération par clé de récupération (mot de passe oublié). Double preuve :
 * la clé de récupération (vérifiée côté serveur via son authKey dérivée) + un code email.
 * Le serveur ne peut rien déchiffrer : il renvoie seulement l'enveloppe à ouvrir localement.
 */
class RecoveryController extends Controller
{
    private const VERIFIED_WINDOW_SECONDS = 600;

    public function __construct(
        private readonly AccountService $accounts,
        private readonly OtpService $otp,
        private readonly DeviceService $devices,
        private readonly AuthSessionService $sessions,
        private readonly ActivityLogger $logger,
    ) {}

    public function start(RecoveryStartRequest $request): JsonResponse
    {
        $email = mb_strtolower($request->validated('email'));
        $user = User::where('email', $email)->first();
        $record = $user?->isActive() ? $user->activeRecoveryRecord() : null;
        $valid = Hash::check($request->validated('recovery_auth_key'), $record?->auth_hash ?? $this->dummyHash());

        // Réponse identique que la clé soit valide ou non (pas d'énumération).
        $generic = [
            'challenge' => (string) Str::uuid(),
            'destination' => Ip::maskEmail($email),
            'message' => 'Si la clé de récupération est valide, un code a été envoyé à l’adresse du compte.',
        ];

        if (! $valid || $record === null) {
            $this->logger->log('recovery.failed', $user);
            $request->session()->forget('pending_recovery');

            return response()->json($generic, 202);
        }

        $challenge = $this->otp->issue($user, 'recovery');
        $request->session()->regenerate();
        $request->session()->put('pending_recovery', [
            'user_id' => $user->id,
            'record_id' => $record->id,
            'challenge_id' => $challenge->id,
            'verified_at' => null,
        ]);
        $this->logger->log('recovery.started', $user);

        return response()->json([...$generic, 'challenge' => $challenge->uuid], 202);
    }

    public function verify(OtpVerifyRequest $request): JsonResponse
    {
        $pending = $request->session()->get('pending_recovery');
        $challenge = is_array($pending) ? OtpChallenge::find($pending['challenge_id']) : null;

        if ($challenge === null || $challenge->uuid !== $request->validated('challenge')
            || ! $this->otp->verify($challenge, $request->validated('code'))) {
            return response()->json(['message' => 'Code invalide ou expiré.', 'code' => 'otp_invalid'], 422);
        }

        $user = User::findOrFail($pending['user_id']);
        $record = RecoveryRecord::findOrFail($pending['record_id']);
        $request->session()->put('pending_recovery', [...$pending, 'verified_at' => now()->timestamp]);

        return response()->json([
            'user_uuid' => $user->uuid,
            'encrypted_user_key_by_recovery' => $record->encrypted_user_key,
            'public_key' => $user->public_key,
            'encrypted_private_key' => $user->encrypted_private_key,
            'kdf_defaults' => ['ops' => (int) config('koffra.kdf.default_ops'), 'mem' => (int) config('koffra.kdf.default_mem')],
        ]);
    }

    public function complete(RecoveryCompleteRequest $request): JsonResponse
    {
        $pending = $request->session()->get('pending_recovery');
        if (! is_array($pending) || ! $pending['verified_at'] || now()->timestamp - $pending['verified_at'] > self::VERIFIED_WINDOW_SECONDS) {
            return response()->json(['message' => 'Procédure expirée : recommencez la récupération.', 'code' => 'recovery_expired'], 422);
        }

        $data = $request->validated();

        [$user, $device, $token] = DB::transaction(function () use ($pending, $data, $request) {
            $user = User::lockForUpdate()->findOrFail($pending['user_id']);
            RecoveryRecord::whereKey($pending['record_id'])->update(['used_at' => now()]);

            $this->accounts->updatePassword($user, $data);
            $this->accounts->storeRecovery($user, $data['recovery']); // révoque l'ancienne clé

            // Toutes les sessions existantes sont fermées (compte potentiellement compromis).
            $this->devices->destroyUserSessions($user->id);

            [$device, $token] = $this->devices->createPending($user, $data['device_label'], $request);
            $this->devices->approve($device, $request);

            return [$user, $device, $token];
        });

        $this->logger->log('recovery.completed', $user, [], $device->id);

        return $this->sessions->open($request, $user, $device, $token, 'auth.login');
    }

    private function dummyHash(): string
    {
        static $hash = null;

        return $hash ??= Hash::make('koffra-dummy-recovery-key');
    }
}
