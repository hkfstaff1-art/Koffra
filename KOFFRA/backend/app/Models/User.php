<?php

namespace App\Models;

use App\Models\Concerns\HasPublicUuid;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * Compte administrateur KOFFRA (rôle unique : admin, 5 comptes max).
 *
 * @property string $uuid
 * @property string $status
 */
#[Fillable(['name', 'email', 'password', 'kdf_params', 'encrypted_user_key', 'public_key', 'encrypted_private_key', 'invited_by', 'email_verified_at'])]
#[Hidden(['id', 'password', 'kdf_params', 'encrypted_user_key', 'encrypted_private_key', 'invited_by'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasPublicUuid, Notifiable;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_DISABLED = 'disabled';

    protected $attributes = [
        'status' => self::STATUS_ACTIVE,
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'disabled_at' => 'datetime',
            'password' => 'hashed',
            'kdf_params' => 'array',
            'encrypted_user_key' => 'array',
            'encrypted_private_key' => 'array',
        ];
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    /** Le mot de passe de session Laravel n'est jamais utilisé : l'authentification passe par l'authKey. */
    public function getRememberTokenName(): string
    {
        return '';
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    public function devices(): HasMany
    {
        return $this->hasMany(TrustedDevice::class);
    }

    public function vaultKeyGrants(): HasMany
    {
        return $this->hasMany(VaultKeyGrant::class);
    }

    public function recoveryRecords(): HasMany
    {
        return $this->hasMany(RecoveryRecord::class);
    }

    public function activeRecoveryRecord(): ?RecoveryRecord
    {
        return $this->recoveryRecords()->whereNull('revoked_at')->latest('id')->first();
    }
}
