<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TrustedDevice;
use App\Services\ActivityLogger;
use App\Services\DeviceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/** Appareils de l'utilisateur connecté (un admin ne gère que ses propres appareils). */
class DeviceController extends Controller
{
    public function __construct(
        private readonly DeviceService $devices,
        private readonly ActivityLogger $logger,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $current = $request->attributes->get('device');

        $devices = $request->user()->devices()
            ->whereNotNull('approved_at')
            ->orderByRaw('revoked_at IS NULL DESC')
            ->orderByDesc('last_seen_at')
            ->get()
            ->map(fn (TrustedDevice $d) => [
                'uuid' => $d->uuid,
                'label' => $d->device_label,
                'approved_at' => $d->approved_at?->toIso8601String(),
                'last_seen_at' => $d->last_seen_at?->toIso8601String(),
                'last_ip' => $d->last_ip_truncated,
                'revoked_at' => $d->revoked_at?->toIso8601String(),
                'current' => $current?->id === $d->id,
            ]);

        return response()->json(['data' => $devices]);
    }

    public function destroy(Request $request, string $uuid): JsonResponse
    {
        $device = $request->user()->devices()->where('uuid', $uuid)->first();
        if ($device === null) {
            return response()->json(['message' => 'Appareil introuvable.'], 404); // pas d'IDOR : seulement ses appareils
        }

        $this->devices->revoke($device);
        $this->logger->log('device.revoked', $request->user(), ['device' => $device->device_label]);

        if ($request->attributes->get('device')?->id === $device->id) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['message' => 'Appareil révoqué.']);
    }

    /** Déconnexion globale : ferme toutes les autres sessions de l'utilisateur. */
    public function logoutOthers(Request $request): JsonResponse
    {
        $this->devices->destroyUserSessions($request->user()->id, $request->session()->getId());
        $this->logger->log('auth.logout_others', $request->user());

        return response()->json(['message' => 'Toutes les autres sessions ont été fermées.']);
    }
}
