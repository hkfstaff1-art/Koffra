<?php

namespace App\Models;

use App\Models\Concerns\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Défi OTP : seul le hachage du code est conservé. */
class OtpChallenge extends Model
{
    use HasPublicUuid;

    public const PURPOSE_LOGIN = 'login';

    public const PURPOSE_REAUTH = 'reauth';

    protected $fillable = ['user_id', 'trusted_device_id', 'purpose', 'channel', 'destination_masked', 'code_hash', 'expires_at', 'max_attempts'];

    protected $hidden = ['id', 'user_id', 'trusted_device_id', 'code_hash'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'consumed_at' => 'datetime', 'attempt_count' => 'integer', 'max_attempts' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(TrustedDevice::class, 'trusted_device_id');
    }

    public function isUsable(): bool
    {
        return $this->consumed_at === null
            && $this->expires_at->isFuture()
            && $this->attempt_count < $this->max_attempts;
    }
}
