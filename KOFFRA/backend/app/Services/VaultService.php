<?php

namespace App\Services;

use App\Models\User;
use App\Models\VaultKey;
use App\Models\VaultKeyGrant;

class VaultService
{
    /** Un admin accède au coffre s'il détient un accès confirmé à la version active de la clé. */
    public function canAccess(User $user): bool
    {
        $current = VaultKey::current();

        return $current !== null && $user->isActive() && $user->vaultKeyGrants()
            ->where('key_version', $current->version)
            ->where('type', VaultKeyGrant::TYPE_CONFIRMED)
            ->exists();
    }

    /** Versions de clé acceptées pour écrire : la version active et, pendant une rotation, la nouvelle. */
    public function writableKeyVersions(): array
    {
        return VaultKey::whereIn('status', [VaultKey::STATUS_ACTIVE, VaultKey::STATUS_ROTATING])
            ->pluck('version')->map(fn ($v) => (int) $v)->all();
    }

    public function isWritableVersion(int $version): bool
    {
        return in_array($version, $this->writableKeyVersions(), true);
    }
}
