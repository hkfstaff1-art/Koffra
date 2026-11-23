<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Métadonnées de récupération : jamais la clé de récupération elle-même. */
class RecoveryRecord extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'recovery_key_fingerprint', 'auth_hash', 'encrypted_user_key'];

    protected $hidden = ['id', 'user_id', 'auth_hash'];

    protected function casts(): array
    {
        return ['encrypted_user_key' => 'array', 'used_at' => 'datetime', 'revoked_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
