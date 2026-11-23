<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Concerns\KeyMaterialRules;
use App\Models\Category;
use App\Models\User;
use App\Models\VaultItem;
use App\Models\VaultKey;
use App\Models\VaultKeyGrant;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Rotation de la clé du coffre (docs/09 §5.6), pilotée par le navigateur :
 *  1. POST /vault-keys : nouvelle version « rotating » + enveloppes pour tous les admins ayant accès ;
 *  2. le navigateur re-chiffre chaque entrée et catégorie (PATCH avec la nouvelle key_version) ;
 *  3. POST /vault-keys/{v}/activate : refusé tant qu'une donnée reste sur une ancienne version.
 */
class VaultKeyController extends Controller
{
    use KeyMaterialRules;

    public function __construct(private readonly ActivityLogger $logger) {}

    public function status(): JsonResponse
    {
        $active = VaultKey::current();
        $rotating = VaultKey::where('status', VaultKey::STATUS_ROTATING)->first();

        return response()->json([
            'active_version' => $active?->version,
            'rotating_version' => $rotating?->version,
            'remaining' => $rotating ? $this->remaining($rotating->version) : null,
        ]);
    }

    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:2'],
            ...$this->envelopeRules('own_grant', 200),
            'sealed_grants' => ['present', 'array', 'max:10'],
            'sealed_grants.*.user_uuid' => ['required', 'uuid', 'distinct'],
            'sealed_grants.*.sealed_key' => ['required', 'string', 'size:112', self::B64],
        ]);

        $user = $request->user();
        $current = VaultKey::current();

        $error = DB::transaction(function () use ($data, $user, $current) {
            if ($current === null || VaultKey::where('status', VaultKey::STATUS_ROTATING)->lockForUpdate()->exists()) {
                return 'Une rotation est déjà en cours.';
            }
            if ((int) $data['version'] !== (int) VaultKey::max('version') + 1) {
                return 'Numéro de version inattendu.';
            }

            // Tous les autres admins actifs ayant accès doivent recevoir la nouvelle clé.
            $expected = User::where('status', User::STATUS_ACTIVE)->where('id', '!=', $user->id)
                ->whereHas('vaultKeyGrants', fn ($q) => $q->where('key_version', $current->version))
                ->pluck('id', 'uuid');
            $provided = collect($data['sealed_grants'])->pluck('sealed_key', 'user_uuid');
            if ($expected->keys()->sort()->values()->all() !== $provided->keys()->sort()->values()->all()) {
                return 'Les enveloppes doivent couvrir exactement les administrateurs ayant accès au coffre.';
            }

            VaultKey::create(['version' => $data['version'], 'status' => VaultKey::STATUS_ROTATING, 'created_by' => $user->id]);
            VaultKeyGrant::create([
                'user_id' => $user->id, 'key_version' => $data['version'], 'type' => VaultKeyGrant::TYPE_CONFIRMED,
                'encrypted_key' => json_encode($data['own_grant']), 'granted_by' => $user->id,
            ]);
            foreach ($provided as $uuid => $sealed) {
                VaultKeyGrant::create([
                    'user_id' => $expected[$uuid], 'key_version' => $data['version'], 'type' => VaultKeyGrant::TYPE_SEALED,
                    'encrypted_key' => $sealed, 'granted_by' => $user->id,
                ]);
            }

            return null;
        });

        if ($error !== null) {
            return response()->json(['message' => $error, 'code' => 'rotation_refused'], 422);
        }

        $request->session()->forget('reauth_at');
        $this->logger->log('vault.rotation_started', $user, ['key_version' => (int) $data['version']]);

        return response()->json(['rotating_version' => (int) $data['version'], 'remaining' => $this->remaining((int) $data['version'])], 201);
    }

    public function activate(Request $request, int $version): JsonResponse
    {
        $result = DB::transaction(function () use ($version) {
            $key = VaultKey::where('version', $version)->where('status', VaultKey::STATUS_ROTATING)->lockForUpdate()->first();
            if ($key === null) {
                return 'Aucune rotation en cours pour cette version.';
            }
            $remaining = $this->remaining($version);
            if ($remaining['items'] > 0 || $remaining['categories'] > 0) {
                return $remaining;
            }

            $old = VaultKey::where('status', VaultKey::STATUS_ACTIVE)->pluck('version');
            VaultKey::whereIn('version', $old)->update(['status' => VaultKey::STATUS_RETIRED]);
            $key->forceFill(['status' => VaultKey::STATUS_ACTIVE])->save();
            // Les anciennes enveloppes deviennent inutiles : elles sont supprimées.
            VaultKeyGrant::where('key_version', '<', $version)->delete();

            return null;
        });

        if (is_string($result)) {
            return response()->json(['message' => $result, 'code' => 'rotation_refused'], 422);
        }
        if (is_array($result)) {
            return response()->json([
                'message' => 'Des données restent chiffrées avec l’ancienne clé.',
                'code' => 'rotation_incomplete',
                'remaining' => $result,
            ], 409);
        }

        $this->logger->log('vault.rotation_completed', $request->user(), ['key_version' => $version]);

        return response()->json(['active_version' => $version]);
    }

    /** Abandon possible seulement si aucune donnée n'utilise encore la nouvelle version. */
    public function abort(Request $request, int $version): JsonResponse
    {
        $key = VaultKey::where('version', $version)->where('status', VaultKey::STATUS_ROTATING)->firstOrFail();

        $used = VaultItem::withTrashed()->where('key_version', $version)->exists()
            || Category::where('key_version', $version)->exists();
        if ($used) {
            return response()->json(['message' => 'Des données utilisent déjà la nouvelle clé : terminez la rotation.', 'code' => 'rotation_refused'], 422);
        }

        $key->delete(); // enveloppes supprimées en cascade
        $this->logger->log('vault.rotation_aborted', $request->user(), ['key_version' => $version]);

        return response()->json(['message' => 'Rotation annulée.']);
    }

    private function remaining(int $version): array
    {
        return [
            'items' => VaultItem::withTrashed()->where('key_version', '<', $version)->count(),
            'categories' => Category::where('key_version', '<', $version)->count(),
        ];
    }
}
