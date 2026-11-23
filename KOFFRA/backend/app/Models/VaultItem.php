<?php

namespace App\Models;

use App\Models\Concerns\HasPublicUuid;
use Database\Factories\VaultItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Entrée du coffre : titre, type et champs sont dans `ciphertext` (chiffré côté client). */
class VaultItem extends Model
{
    /** @use HasFactory<VaultItemFactory> */
    use HasFactory, HasPublicUuid, SoftDeletes;

    protected $fillable = ['category_id', 'ciphertext', 'nonce', 'crypto_version', 'key_version', 'favorite', 'archived_at', 'created_by', 'updated_by'];

    protected $hidden = ['id', 'category_id', 'created_by', 'updated_by'];

    protected $attributes = [
        'revision' => 1,
        'favorite' => false,
    ];

    protected function casts(): array
    {
        return [
            'favorite' => 'boolean',
            'archived_at' => 'datetime',
            'revision' => 'integer',
            'crypto_version' => 'integer',
            'key_version' => 'integer',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }
}
