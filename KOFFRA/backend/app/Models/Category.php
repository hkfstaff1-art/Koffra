<?php

namespace App\Models;

use App\Models\Concerns\HasPublicUuid;
use Database\Factories\CategoryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Catégorie du coffre : le nom est chiffré côté client. */
class Category extends Model
{
    /** @use HasFactory<CategoryFactory> */
    use HasFactory, HasPublicUuid;

    protected $fillable = ['name_ciphertext', 'name_nonce', 'crypto_version', 'key_version', 'icon', 'sort_order', 'created_by'];

    protected $hidden = ['id', 'created_by'];

    protected function casts(): array
    {
        return ['crypto_version' => 'integer', 'key_version' => 'integer', 'sort_order' => 'integer'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(VaultItem::class);
    }
}
