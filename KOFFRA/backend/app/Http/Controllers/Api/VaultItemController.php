<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Vault\StoreVaultItemRequest;
use App\Http\Requests\Vault\UpdateVaultItemRequest;
use App\Http\Resources\VaultItemResource;
use App\Models\Category;
use App\Models\VaultItem;
use App\Services\ActivityLogger;
use App\Services\AttachmentStorage;
use App\Services\VaultService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

/**
 * Entrées du coffre partagé. Le serveur ne manipule que du contenu chiffré ;
 * la recherche et le filtrage par type/titre se font dans le navigateur après déchiffrement.
 */
class VaultItemController extends Controller
{
    public function __construct(
        private readonly VaultService $vault,
        private readonly ActivityLogger $logger,
        private readonly AttachmentStorage $storage,
    ) {}

    /** Pagination serveur : le client charge toutes les pages pour sa recherche locale. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'trashed' => ['sometimes', 'in:only,with,without'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:500'],
        ]);

        $query = VaultItem::with(['category:id,uuid', 'attachments'])->orderBy('id');
        match ($validated['trashed'] ?? 'without') {
            'only' => $query->onlyTrashed(),
            'with' => $query->withTrashed(),
            default => null,
        };

        return VaultItemResource::collection($query->paginate($validated['per_page'] ?? 200));
    }

    public function show(string $uuid): VaultItemResource
    {
        return new VaultItemResource($this->find($uuid, withTrashed: true)->load(['category:id,uuid', 'attachments']));
    }

    public function store(StoreVaultItemRequest $request): JsonResponse
    {
        $data = $request->validated();
        if (! $this->vault->isWritableVersion((int) $data['key_version'])) {
            return $this->staleKey();
        }

        $item = new VaultItem([
            'category_id' => $this->categoryId($data['category_uuid'] ?? null),
            'ciphertext' => $data['payload']['c'],
            'nonce' => $data['payload']['n'],
            'crypto_version' => $data['payload']['v'],
            'key_version' => $data['key_version'],
            'favorite' => $data['favorite'] ?? false,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);
        $item->uuid = $data['uuid'];
        $item->save();

        $this->logger->log('item.created', $request->user(), ['item' => $item->uuid]);

        return (new VaultItemResource($item->load(['category:id,uuid', 'attachments'])))->response()->setStatusCode(201);
    }

    public function update(UpdateVaultItemRequest $request, string $uuid): JsonResponse
    {
        $data = $request->validated();

        if (isset($data['key_version']) && ! $this->vault->isWritableVersion((int) $data['key_version'])) {
            return $this->staleKey();
        }

        $result = DB::transaction(function () use ($uuid, $data, $request) {
            $item = VaultItem::where('uuid', $uuid)->lockForUpdate()->first();
            if ($item === null) {
                return 404;
            }
            if ($item->revision !== (int) $data['revision']) {
                return 409;
            }

            if (isset($data['payload'])) {
                $item->ciphertext = $data['payload']['c'];
                $item->nonce = $data['payload']['n'];
                $item->crypto_version = $data['payload']['v'];
                $item->key_version = $data['key_version'];
            }
            if (array_key_exists('category_uuid', $data)) {
                $item->category_id = $this->categoryId($data['category_uuid']);
            }
            if (array_key_exists('favorite', $data)) {
                $item->favorite = $data['favorite'];
            }
            if (array_key_exists('archived', $data)) {
                $item->archived_at = $data['archived'] ? ($item->archived_at ?? now()) : null;
            }
            $item->updated_by = $request->user()->id;
            $item->revision++;
            $item->save();

            return $item;
        });

        if ($result === 404) {
            return response()->json(['message' => 'Entrée introuvable.'], 404);
        }
        if ($result === 409) {
            return response()->json([
                'message' => 'Cette entrée a été modifiée entre-temps par un autre administrateur. Rechargez-la avant de l’enregistrer.',
                'code' => 'revision_conflict',
            ], 409);
        }

        $this->logger->log('item.updated', $request->user(), ['item' => $uuid]);

        return (new VaultItemResource($result->load(['category:id,uuid', 'attachments'])))->response();
    }

    /** Mise à la corbeille (restaurable). */
    public function destroy(Request $request, string $uuid): JsonResponse
    {
        $item = $this->find($uuid);
        $item->delete();
        $this->logger->log('item.trashed', $request->user(), ['item' => $uuid]);

        return response()->json(['message' => 'Entrée placée dans la corbeille.']);
    }

    public function restore(Request $request, string $uuid): JsonResponse
    {
        $item = VaultItem::onlyTrashed()->where('uuid', $uuid)->firstOrFail();
        $item->restore();
        $this->logger->log('item.restored', $request->user(), ['item' => $uuid]);

        return (new VaultItemResource($item->load(['category:id,uuid', 'attachments'])))->response();
    }

    /** Suppression définitive depuis la corbeille (réauthentification exigée). */
    public function forceDestroy(Request $request, string $uuid): JsonResponse
    {
        $item = VaultItem::onlyTrashed()->where('uuid', $uuid)->firstOrFail();

        DB::transaction(function () use ($item) {
            foreach ($item->attachments as $attachment) {
                $this->storage->delete($attachment->storage_key);
            }
            $item->forceDelete();
        });

        $request->session()->forget('reauth_at');
        $this->logger->log('item.deleted_permanently', $request->user(), ['item' => $uuid]);

        return response()->json(['message' => 'Entrée supprimée définitivement.']);
    }

    private function find(string $uuid, bool $withTrashed = false): VaultItem
    {
        return VaultItem::query()->when($withTrashed, fn ($q) => $q->withTrashed())->where('uuid', $uuid)->firstOrFail();
    }

    private function categoryId(?string $uuid): ?int
    {
        return $uuid === null ? null : Category::where('uuid', $uuid)->value('id');
    }

    private function staleKey(): JsonResponse
    {
        return response()->json([
            'message' => 'La clé du coffre a changé : rechargez le coffre avant d’enregistrer.',
            'code' => 'stale_key_version',
        ], 409);
    }
}
