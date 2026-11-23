<?php

namespace App\Http\Middleware;

use App\Models\TrustedDevice;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * À chaque requête authentifiée : le compte doit être actif et la session rattachée
 * à un appareil approuvé non révoqué. Sinon la session est détruite immédiatement
 * (révocation à distance effective dès la requête suivante).
 */
class EnsureTrustedDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $deviceId = $request->session()->get('device_id');

        $device = $deviceId ? TrustedDevice::find($deviceId) : null;

        if (! $user || ! $user->isActive() || ! $device || $device->user_id !== $user->id || ! $device->isApproved()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json(['message' => 'Session expirée ou appareil révoqué.', 'code' => 'session_revoked'], 401);
        }

        // Mise à jour d'activité au plus une fois par minute
        if ($device->last_seen_at === null || $device->last_seen_at->lt(now()->subMinute())) {
            $device->forceFill(['last_seen_at' => now()])->saveQuietly();
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }
}
