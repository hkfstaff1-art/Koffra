<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Vault\CategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use App\Services\ActivityLogger;
use App\Services\VaultService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Catégories : nom chiffré côté client (il peut révéler une information sensible). */
class CategoryController extends Controller
{
    public function __construct(
        private readonly VaultService $vault,
        private readonly ActivityLogger $logger,
    ) {}

    public function index(): AnonymousResourceCollection
    {
        return CategoryResource::collection(Category::orderBy('sort_order')->orderBy('id')->get());
    }

    public function store(CategoryRequest $request): JsonResponse
    {
        $data = $request->validated();
        if (! $this->vault->isWritableVersion((int) $data['key_version'])) {
            return response()->json(['message' => 'La clé du coffre a changé : rechargez le coffre.', 'code' => 'stale_key_version'], 409);
        }

        $category = new Category([
            'name_ciphertext' => $data['name']['c'],
            'name_nonce' => $data['name']['n'],
            'crypto_version' => $data['name']['v'],
            'key_version' => $data['key_version'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => $data['sort_order'] ?? 0,
            'created_by' => $request->user()->id,
        ]);
        $category->uuid = $data['uuid'];
        $category->save();

        $this->logger->log('category.created', $request->user(), ['category' => $category->uuid]);

        return (new CategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(CategoryRequest $request, string $uuid): JsonResponse
    {
        $category = Category::where('uuid', $uuid)->firstOrFail();
        $data = $request->validated();

        if (isset($data['name'])) {
            if (! $this->vault->isWritableVersion((int) $data['key_version'])) {
                return response()->json(['message' => 'La clé du coffre a changé : rechargez le coffre.', 'code' => 'stale_key_version'], 409);
            }
            $category->fill([
                'name_ciphertext' => $data['name']['c'],
                'name_nonce' => $data['name']['n'],
                'crypto_version' => $data['name']['v'],
                'key_version' => $data['key_version'],
            ]);
        }
        $category->fill(array_intersect_key($data, array_flip(['icon', 'sort_order'])))->save();

        $this->logger->log('category.updated', $request->user(), ['category' => $uuid]);

        return (new CategoryResource($category))->response();
    }

    /** Les entrées de la catégorie sont conservées (sans catégorie). */
    public function destroy(Request $request, string $uuid): JsonResponse
    {
        Category::where('uuid', $uuid)->firstOrFail()->delete();
        $this->logger->log('category.deleted', $request->user(), ['category' => $uuid]);

        return response()->json(['message' => 'Catégorie supprimée. Ses entrées sont conservées sans catégorie.']);
    }
}
