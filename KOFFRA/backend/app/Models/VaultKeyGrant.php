<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Enveloppe de la clé du coffre destinée à un admin (confirmée par userKey, ou scellée à l'invitation). */
class VaultKeyGrant extends Model
{
    public const TYPE_CONFIRMED = 'confirmed';

    public const TYPE_SEALED = 'sealed';

    protected $fillable = ['user_id', 'key_version', 'type', 'encrypted_key', 'granted_by'];

    protected $hidden = ['id', 'user_id', 'granted_by'];

    protected function casts(): array
    {
        return ['key_version' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
