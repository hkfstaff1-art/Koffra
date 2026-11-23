<?php

namespace App\Services;

use App\Mail\OtpCodeMail;
use App\Models\OtpChallenge;
use App\Models\TrustedDevice;
use App\Models\User;
use App\Support\Ip;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Codes OTP à usage unique envoyés par email au canal déjà vérifié du compte.
 * Seul un HMAC du code est stocké ; expiration courte ; tentatives limitées ; anti-rejeu.
 */
class OtpService
{
    public function issue(User $user, string $purpose, ?TrustedDevice $device = null): OtpChallenge
    {
        // Un seul défi actif par compte et par usage : les précédents sont invalidés.
        OtpChallenge::where('user_id', $user->id)
            ->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $length = (int) config('koffra.otp.length');
        $code = str_pad((string) random_int(0, 10 ** $length - 1), $length, '0', STR_PAD_LEFT);

        $challenge = new OtpChallenge([
            'user_id' => $user->id,
            'trusted_device_id' => $device?->id,
            'purpose' => $purpose,
            'channel' => 'email',
            'destination_masked' => Ip::maskEmail($user->email),
            'code_hash' => '',
            'expires_at' => now()->addMinutes((int) config('koffra.otp.ttl_minutes')),
            'max_attempts' => (int) config('koffra.otp.max_attempts'),
        ]);
        $challenge->save();
        $challenge->forceFill(['code_hash' => $this->hash($challenge, $code)])->save();

        Mail::to($user->email)->send(new OtpCodeMail($user->name, $code, (int) config('koffra.otp.ttl_minutes'), $purpose));

        return $challenge;
    }

    /**
     * Vérifie un code. Chaque essai est compté (y compris le bon) ; un défi réussi est consommé.
     * Verrou pessimiste : deux requêtes simultanées ne peuvent pas consommer le même code.
     */
    public function verify(OtpChallenge $challenge, string $code): bool
    {
        return DB::transaction(function () use ($challenge, $code): bool {
            /** @var OtpChallenge $locked */
            $locked = OtpChallenge::whereKey($challenge->id)->lockForUpdate()->firstOrFail();

            if (! $locked->isUsable()) {
                return false;
            }

            $locked->increment('attempt_count');

            if (! hash_equals($locked->code_hash, $this->hash($locked, $code))) {
                return false;
            }

            $locked->forceFill(['consumed_at' => now()])->save();
            $challenge->setRawAttributes($locked->getAttributes(), true);

            return true;
        });
    }

    public function canResend(User $user, string $purpose): bool
    {
        $last = OtpChallenge::where('user_id', $user->id)->where('purpose', $purpose)->latest('id')->first();

        return $last === null
            || $last->created_at->lte(now()->subSeconds((int) config('koffra.otp.resend_cooldown_seconds')));
    }

    private function hash(OtpChallenge $challenge, string $code): string
    {
        return hash_hmac('sha256', $challenge->uuid.'|'.$code, (string) config('app.key'));
    }
}
