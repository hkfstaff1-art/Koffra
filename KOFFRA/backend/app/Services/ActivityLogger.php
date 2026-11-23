<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\User;
use App\Support\Ip;
use Illuminate\Http\Request;

/**
 * Journal d'activité. Les métadonnées sont filtrées : toute clé évoquant un secret est retirée,
 * et seules des valeurs scalaires courtes sont conservées.
 */
class ActivityLogger
{
    private const FORBIDDEN_KEY_PATTERN = '/key|password|secret|token|code|otp|cipher|nonce|envelope|payload/i';

    public function __construct(private readonly Request $request) {}

    public function log(string $event, ?User $user = null, array $metadata = [], ?int $deviceId = null): ActivityLog
    {
        return ActivityLog::create([
            'user_id' => $user?->id,
            'event_type' => $event,
            'device_id' => $deviceId ?? $this->request->session()?->get('device_id'),
            'ip_truncated' => Ip::truncate($this->request->ip()),
            'metadata' => $this->sanitize($metadata) ?: null,
        ]);
    }

    public function sanitize(array $metadata): array
    {
        $safe = [];
        foreach ($metadata as $key => $value) {
            if (preg_match(self::FORBIDDEN_KEY_PATTERN, (string) $key)) {
                continue;
            }
            if (is_bool($value) || is_int($value) || is_null($value)) {
                $safe[$key] = $value;
            } elseif (is_string($value)) {
                $safe[$key] = mb_substr($value, 0, 120);
            }
        }

        return $safe;
    }
}
