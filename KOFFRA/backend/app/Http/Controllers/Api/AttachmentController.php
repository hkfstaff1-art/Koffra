<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use App\Models\VaultItem;
use App\Services\ActivityLogger;
use App\Services\AttachmentStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * Pièces jointes chiffrées côté client (secretstream). Le serveur reçoit un blob opaque,
 * vérifie sa taille et son SHA-256, et ne connaît ni le nom ni le type réel du fichier.
 */
class AttachmentController extends Controller
{
    public function __construct(
        private readonly AttachmentStorage $storage,
        private readonly ActivityLogger $logger,
    ) {}

    public function store(Request $request, string $itemUuid): JsonResponse
    {
        $item = VaultItem::where('uuid', $itemUuid)->firstOrFail();
        $maxKb = (int) ceil(config('koffra.attachments.max_bytes') / 1024);

        $data = $request->validate([
            'uuid' => ['required', 'uuid', 'unique:attachments,uuid'],
            'file' => ['required', 'file', "max:$maxKb"],
            'ciphertext_sha256' => ['required', 'string', 'regex:/^[0-9a-f]{64}$/'],
        ]);

        $contents = file_get_contents($data['file']->getRealPath());
        // En-tête secretstream (24 o) + au moins un bloc (17 o) : sinon ce n'est pas un fichier chiffré KOFFRA
        if ($contents === false || strlen($contents) < 41) {
            return response()->json(['message' => 'Fichier chiffré invalide.', 'code' => 'invalid_attachment'], 422);
        }
        if (! hash_equals($data['ciphertext_sha256'], hash('sha256', $contents))) {
            return response()->json(['message' => 'Fichier altéré pendant l’envoi.', 'code' => 'checksum_mismatch'], 422);
        }

        $key = $this->storage->put($contents);

        try {
            $attachment = DB::transaction(function () use ($item, $data, $key, $contents, $request) {
                $attachment = new Attachment([
                    'vault_item_id' => $item->id,
                    'storage_key' => $key,
                    'encrypted_size' => strlen($contents),
                    'ciphertext_sha256' => $data['ciphertext_sha256'],
                    'crypto_version' => 1,
                    'created_by' => $request->user()->id,
                ]);
                $attachment->uuid = $data['uuid'];
                $attachment->save();

                return $attachment;
            });
        } catch (\Throwable $e) {
            $this->storage->delete($key);
            throw $e;
        }

        $this->logger->log('attachment.added', $request->user(), ['item' => $item->uuid, 'attachment' => $attachment->uuid]);

        return response()->json([
            'uuid' => $attachment->uuid,
            'encrypted_size' => $attachment->encrypted_size,
            'ciphertext_sha256' => $attachment->ciphertext_sha256,
        ], 201);
    }

    /** Téléchargement du blob chiffré (le navigateur le déchiffre). */
    public function show(string $uuid): Response
    {
        $attachment = Attachment::where('uuid', $uuid)->firstOrFail();
        $contents = $this->storage->get($attachment->storage_key);
        abort_if($contents === null, 404);

        return response($contents, 200, [
            'Content-Type' => 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="koffra-'.$attachment->uuid.'.bin"',
            'X-Content-Type-Options' => 'nosniff',
            'X-Ciphertext-Sha256' => $attachment->ciphertext_sha256,
        ]);
    }

    public function destroy(Request $request, string $uuid): JsonResponse
    {
        $attachment = Attachment::with('item')->where('uuid', $uuid)->firstOrFail();
        $this->storage->delete($attachment->storage_key);
        $attachment->delete();
        $this->logger->log('attachment.deleted', $request->user(), ['attachment' => $uuid]);

        return response()->json(['message' => 'Pièce jointe supprimée.']);
    }
}
