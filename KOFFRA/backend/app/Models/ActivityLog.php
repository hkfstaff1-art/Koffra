<?php

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Journal d'activité en ajout seul. Les métadonnées ne contiennent jamais de valeur secrète. */
class ActivityLog extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'event_type', 'device_id', 'ip_truncated', 'metadata'];

    protected function casts(): array
    {
        return ['metadata' => 'array', 'created_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(TrustedDevice::class, 'device_id');
    }
}
