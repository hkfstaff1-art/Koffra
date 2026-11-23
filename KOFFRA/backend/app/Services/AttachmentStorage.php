<?php

namespace App\Services;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Stockage des pièces jointes CHIFFRÉES (illisibles sans la clé du coffre) sur un disque
 * privé, hors du dossier public. Nom de fichier aléatoire, sans lien avec le nom réel.
 */
class AttachmentStorage
{
    private function disk(): Filesystem
    {
        return Storage::disk(config('koffra.attachments.disk'));
    }

    public function put(string $contents): string
    {
        $key = 'attachments/'.Str::random(40).'.bin';
        $this->disk()->put($key, $contents);

        return $key;
    }

    public function get(string $key): ?string
    {
        return $this->disk()->get($key);
    }

    public function delete(string $key): void
    {
        $this->disk()->delete($key);
    }
}
