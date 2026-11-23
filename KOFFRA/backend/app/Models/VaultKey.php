<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Version de la clé du coffre partagé (la clé elle-même n'est jamais connue du serveur). */
class VaultKey extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_ROTATING = 'rotating';

    public const STATUS_RETIRED = 'retired';

    protected $fillable = ['version', 'status', 'created_by'];

    protected $hidden = ['id', 'created_by'];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    public function grants(): HasMany
    {
        return $this->hasMany(VaultKeyGrant::class, 'key_version', 'version');
    }

    public static function current(): ?self
    {
        return static::where('status', self::STATUS_ACTIVE)->orderByDesc('version')->first();
    }
}
