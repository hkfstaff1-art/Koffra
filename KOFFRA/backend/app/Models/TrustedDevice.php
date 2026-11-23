<?php

namespace App\Models;

use App\Models\Concerns\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Appareil approuvé : identifié par le hachage d'un jeton aléatoire stocké en cookie HttpOnly. */
class TrustedDevice extends Model
{
    use HasPublicUuid;

    protected $fillable = ['user_id', 'device_label', 'device_token_hash', 'approved_at', 'last_seen_at', 'last_ip_truncated', 'revoked_at'];

    protected $hidden = ['id', 'user_id', 'device_token_hash'];

    protected function casts(): array
    {
        return ['approved_at' => 'datetime', 'last_seen_at' => 'datetime', 'revoked_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isApproved(): bool
    {
        return $this->approved_at !== null && $this->revoked_at === null;
    }
}
