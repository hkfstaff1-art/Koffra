<?php

namespace App\Services;

use App\Models\TrustedDevice;
use App\Models\User;
use App\Support\Ip;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Cookie as SymfonyCookie;

/**
 * Appareils : un jeton aléatoire de 256 bits est placé dans un cookie HttpOnly ;
 * seul son SHA-256 est stocké. Un appareil n'est approuvé qu'après un OTP envoyé
 * au canal déjà vérifié : il ne peut pas s'auto-approuver.
 */
class DeviceService
{
    public function cookieName(): string
    {
        return config('koffra.device.cookie');
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /** Appareil approuvé de cet utilisateur correspondant au cookie de la requête, sinon null. */
    public function approvedDeviceFor(Request $request, User $user): ?TrustedDevice
    {
        $token = $request->cookie($this->cookieName());
        if (! is_string($token) || strlen($token) < 40) {
            return null;
        }

        $device = TrustedDevice::where('device_token_hash', self::hashToken($token))
            ->where('user_id', $user->id)
            ->first();

        return $device?->isApproved() ? $device : null;
    }

    /** Crée un appareil en attente d'approbation et renvoie [appareil, jeton en clair pour le cookie]. */
    public function createPending(User $user, string $label, Request $request): array
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');

        $device = TrustedDevice::create([
            'user_id' => $user->id,
            'device_label' => mb_substr($label, 0, 120),
            'device_token_hash' => self::hashToken($token),
            'last_ip_truncated' => Ip::truncate($request->ip()),
        ]);

        return [$device, $token];
    }

    public function approve(TrustedDevice $device, Request $request): void
    {
        $device->forceFill([
            'approved_at' => now(),
            'last_seen_at' => now(),
            'last_ip_truncated' => Ip::truncate($request->ip()),
        ])->save();
    }

    public function touch(TrustedDevice $device, Request $request): void
    {
        $device->forceFill([
            'last_seen_at' => now(),
            'last_ip_truncated' => Ip::truncate($request->ip()),
        ])->save();
    }

    public function makeCookie(string $token): SymfonyCookie
    {
        return Cookie::make(
            $this->cookieName(),
            $token,
            config('koffra.device.cookie_days') * 24 * 60,
            '/',
            config('session.domain'),
            config('session.secure'),
            true,
            false,
            'strict',
        );
    }

    /**
     * Révoque l'appareil. Ses sessions sont refusées dès la requête suivante
     * (middleware EnsureTrustedDevice vérifie l'appareil à chaque requête).
     */
    public function revoke(TrustedDevice $device): void
    {
        $device->forceFill(['revoked_at' => now()])->save();
    }

    /** Ferme les sessions d'un utilisateur, sauf éventuellement la session courante. */
    public function destroyUserSessions(int $userId, ?string $exceptSessionId = null): void
    {
        $query = DB::table('sessions')->where('user_id', $userId);
        if ($exceptSessionId !== null) {
            $query->where('id', '!=', $exceptSessionId);
        }
        $query->delete();
    }
}
