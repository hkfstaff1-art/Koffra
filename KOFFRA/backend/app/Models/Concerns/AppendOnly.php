<?php

namespace App\Models\Concerns;

use LogicException;

/** Modèle en ajout seul : toute modification ou suppression est refusée. */
trait AppendOnly
{
    public static function bootAppendOnly(): void
    {
        static::updating(fn () => throw new LogicException(static::class.' est en ajout seul.'));
        static::deleting(fn () => throw new LogicException(static::class.' est en ajout seul.'));
    }
}
