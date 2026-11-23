<?php

namespace App\Http\Resources;

use App\Models\Attachment;
use App\Models\VaultItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin VaultItem */
class VaultItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'category_uuid' => $this->category?->uuid,
            'payload' => ['v' => $this->crypto_version, 'n' => $this->nonce, 'c' => $this->ciphertext],
            'key_version' => $this->key_version,
            'favorite' => $this->favorite,
            'archived_at' => $this->archived_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
            'revision' => $this->revision,
            'attachments' => $this->whenLoaded('attachments', fn () => $this->attachments->map(fn (Attachment $a) => [
                'uuid' => $a->uuid,
                'encrypted_size' => $a->encrypted_size,
                'ciphertext_sha256' => $a->ciphertext_sha256,
                'created_at' => $a->created_at?->toIso8601String(),
            ])),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
