<?php

namespace App\Services;

use App\Models\TrustedDevice;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/** Ouverture de session commune (connexion, installation, invitation, récupération). */
class AuthSessionService
{
    public function __construct(
        private readonly AccountService $accounts,
        private readonly DeviceService $devices,
        private readonly ActivityLogger $logger,
    ) {}

    public function open(Request $request, User $user, TrustedDevice $device, ?string $newDeviceToken, string $event, int $status = 200): JsonResponse
    {
        Auth::guard('web')->login($user);
        $request->session()->regenerate(); // anti-fixation de session
        $request->session()->put('device_id', $device->id);
        $request->session()->forget(['pending_login', 'pending_recovery', 'setup', 'invite', 'reauth_at']);

        $user->forceFill(['last_login_at' => now()])->save();
        $this->devices->touch($device, $request);
        $this->logger->log($event, $user, ['device' => $device->device_label], $device->id);

        $response = response()->json($this->mePayload($user, $device), $status);

        if ($newDeviceToken !== null) {
            $response->withCookie($this->devices->makeCookie($newDeviceToken));
        }

        return $response;
    }

    public function mePayload(User $user, ?TrustedDevice $device = null): array
    {
        return [
            'user' => [
                'uuid' => $user->uuid,
                'name' => $user->name,
                'email' => $user->email,
                'status' => $user->status,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
                'created_at' => $user->created_at?->toIso8601String(),
            ],
            'device' => $device ? ['uuid' => $device->uuid, 'label' => $device->device_label] : null,
            'keys' => $this->accounts->keyMaterial($user),
            'limits' => [
                'max_accounts' => (int) config('koffra.max_accounts'),
                'used_seats' => $this->accounts->countSeats(),
            ],
        ];
    }
}
