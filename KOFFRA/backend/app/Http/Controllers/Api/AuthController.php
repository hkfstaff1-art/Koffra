<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\OtpVerifyRequest;
use App\Http\Requests\Auth\PreloginRequest;
use App\Http\Requests\Auth\ReauthRequest;
use App\Models\OtpChallenge;
use App\Models\TrustedDevice;
use App\Models\User;
use App\Services\AccountService;
use App\Services\ActivityLogger;
use App\Services\AuthSessionService;
use App\Services\DeviceService;
use App\Services\OtpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(
        private readonly AccountService $accounts,
        private readonly DeviceService $devices,
        private readonly OtpService $otp,
        private readonly AuthSessionService $sessions,
        private readonly ActivityLogger $logger,
    ) {}

    /** Paramètres de dérivation : réels ou factices, réponse identique dans les deux cas. */
    public function prelogin(PreloginRequest $request): JsonResponse
    {
        return response()->json(['kdf_params' => $this->accounts->kdfParamsFor($request->validated('email'))]);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = $this->accounts->attempt($request->validated('email'), $request->validated('auth_key'));

        if ($user === null) {
            $known = User::where('email', mb_strtolower($request->validated('email')))->first();
            $this->logger->log('auth.login_failed', $known);

            return response()->json(['message' => 'Identifiants invalides.', 'code' => 'invalid_credentials'], 422);
        }

        // Appareil déjà approuvé : connexion directe.
        $device = $this->devices->approvedDeviceFor($request, $user);
        if ($device !== null) {
            return $this->sessions->open($request, $user, $device, null, 'auth.login');
        }

        // Nouvel appareil : il ne peut pas s'auto-approuver → code envoyé au canal déjà vérifié.
        return DB::transaction(function () use ($request, $user) {
            [$device, $token] = $this->devices->createPending($user, $request->validated('device_label'), $request);
            $challenge = $this->otp->issue($user, OtpChallenge::PURPOSE_LOGIN, $device);

            $request->session()->regenerate();
            $request->session()->put('pending_login', [
                'user_id' => $user->id,
                'device_id' => $device->id,
                'device_token' => $token,
                'challenge_id' => $challenge->id,
            ]);
            $this->logger->log('auth.otp_sent', $user, ['purpose' => 'login'], $device->id);

            return response()->json([
                'otp_required' => true,
                'challenge' => $challenge->uuid,
                'destination' => $challenge->destination_masked,
                'expires_at' => $challenge->expires_at->toIso8601String(),
            ], 202);
        });
    }

    public function verifyOtp(OtpVerifyRequest $request): JsonResponse
    {
        $pending = $request->session()->get('pending_login');
        $challenge = is_array($pending) ? OtpChallenge::find($pending['challenge_id']) : null;

        // Le défi doit appartenir à CETTE session de navigateur.
        if ($challenge === null || $challenge->uuid !== $request->validated('challenge')) {
            return $this->otpFailure();
        }

        $user = User::find($pending['user_id']);
        $device = TrustedDevice::find($pending['device_id']);

        if (! $user?->isActive() || $device === null || ! $this->otp->verify($challenge, $request->validated('code'))) {
            $this->logger->log('auth.otp_failed', $user, ['purpose' => 'login'], $device?->id);
            $challenge->refresh();

            return $this->otpFailure(max(0, $challenge->max_attempts - $challenge->attempt_count));
        }

        $this->devices->approve($device, $request);
        $this->logger->log('device.approved', $user, ['device' => $device->device_label], $device->id);

        return $this->sessions->open($request, $user, $device, $pending['device_token'], 'auth.login');
    }

    public function resendOtp(Request $request): JsonResponse
    {
        $pending = $request->session()->get('pending_login');
        $user = is_array($pending) ? User::find($pending['user_id']) : null;
        $device = is_array($pending) ? TrustedDevice::find($pending['device_id']) : null;

        if ($user === null || $device === null) {
            return $this->otpFailure();
        }
        if (! $this->otp->canResend($user, OtpChallenge::PURPOSE_LOGIN)) {
            return response()->json(['message' => 'Patientez avant de demander un nouveau code.', 'code' => 'otp_cooldown'], 429);
        }

        $challenge = $this->otp->issue($user, OtpChallenge::PURPOSE_LOGIN, $device);
        $request->session()->put('pending_login', [...$pending, 'challenge_id' => $challenge->id]);

        return response()->json([
            'otp_required' => true,
            'challenge' => $challenge->uuid,
            'destination' => $challenge->destination_masked,
            'expires_at' => $challenge->expires_at->toIso8601String(),
        ], 202);
    }

    public function logout(Request $request): JsonResponse
    {
        $this->logger->log('auth.logout', $request->user());
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Déconnecté.']);
    }

    /** Réauthentification pour les actions sensibles (valable 5 minutes). */
    public function reauth(ReauthRequest $request): JsonResponse
    {
        $user = $request->user();

        if (! Hash::check($request->validated('auth_key'), $user->getAuthPassword())) {
            $this->logger->log('auth.reauth_failed', $user);

            return response()->json(['message' => 'Mot de passe incorrect.', 'code' => 'invalid_credentials'], 422);
        }

        $request->session()->put('reauth_at', now()->timestamp);
        $this->logger->log('auth.reauth', $user);

        return response()->json(['reauth_valid_until' => now()->addSeconds(300)->toIso8601String()]);
    }

    private function otpFailure(?int $remaining = null): JsonResponse
    {
        return response()->json([
            'message' => 'Code invalide ou expiré.',
            'code' => 'otp_invalid',
            'remaining_attempts' => $remaining,
        ], 422);
    }
}
