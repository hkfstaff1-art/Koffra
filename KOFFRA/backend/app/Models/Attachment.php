<?php

namespace App\Models;

use App\Models\Concerns\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Pièce jointe chiffrée côté client ; nom et type MIME sont dans le payload chiffré de l'entrée. */
class Attachment extends Model
{
    use HasPublicUuid;

    protected $fillable = ['vault_item_id', 'storage_key', 'encrypted_size', 'ciphertext_sha256', 'crypto_version', 'created_by'];

    protected $hidden = ['id', 'vault_item_id', 'storage_key', 'created_by'];

    protected function casts(): array
    {
        return ['encrypted_size' => 'integer', 'crypto_version' => 'integer'];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(VaultItem::class, 'vault_item_id');
    }
}
