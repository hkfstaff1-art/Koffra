<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CategoryResource;
use App\Http\Resources\VaultItemResource;
use App\Models\Category;
use App\Models\VaultItem;
use App\Models\VaultKey;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Export (réauthentification exigée). Le serveur fournit uniquement les données chiffrées
 * par la clé du coffre ; le navigateur les re-chiffre avec une phrase d'export choisie par
 * l'utilisateur avant de produire le fichier. Aucun export en clair n'est possible.
 */
class ExportController extends Controller
{
    public function __construct(private readonly ActivityLogger $logger) {}

    public function store(Request $request): JsonResponse
    {
        $items = VaultItem::with(['category:id,uuid', 'attachments'])->orderBy('id')->get();
        $categories = Category::orderBy('sort_order')->get();

        $request->session()->forget('reauth_at');
        $this->logger->log('export.created', $request->user(), ['items' => $items->count()]);

        return response()->json([
            'format' => 'koffra-vault-export',
            'format_version' => 1,
            'exported_at' => now()->toIso8601String(),
            'vault_key_version' => VaultKey::current()?->version,
            'categories' => CategoryResource::collection($categories)->resolve($request),
            'items' => VaultItemResource::collection($items)->resolve($request),
        ]);
    }
}
