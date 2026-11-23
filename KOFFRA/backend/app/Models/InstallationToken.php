<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Jeton à usage unique pour l'initialisation du premier propriétaire (php artisan koffra:install). */
class InstallationToken extends Model
{
    protected $fillable = ['token_hash', 'expires_at'];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'used_at' => 'datetime'];
    }
}
