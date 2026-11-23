<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * UUID public aléatoire (v4, non prédictible) dans la colonne `uuid`,
 * utilisé dans les URL à la place de l'identifiant interne.
 * L'autorisation reste vérifiée sur chaque ressource (Policies).
 */
trait HasPublicUuid
{
    public static function bootHasPublicUuid(): void
    {
        static::creating(function ($model): void {
            if (empty($model->uuid)) {
                $model->uuid = (string) Str::uuid();
            }
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }
}
