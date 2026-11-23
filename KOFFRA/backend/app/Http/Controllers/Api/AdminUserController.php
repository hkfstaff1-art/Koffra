<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\VaultGrantConfirmRequest;
use App\Http\Requests\Auth\VaultGrantStoreRequest;
use App\Models\User;
use App\Models\VaultKey;
use App\Models\VaultKeyGrant;
use App\Services\ActivityLogger;
use App\Services\DeviceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Comptes administrateurs (rôle unique, privilèges complets) et partage de la clé du coffre.
 */
class AdminUserController extends Controller
{
    public function __construct(
        private readonly DeviceService $devices,
        private readonly ActivityLogger $logger,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $current = VaultKey::current()?->version;

        $users = User::with('vaultKeyGrants:id,user_id,key_version,type')->orderBy('created_at')->get()
            ->map(function (User $u) use ($current, $request) {
                $grants = $u->vaultKeyGrants->where('key_version', $current);

                return [
                    'uuid' => $u->uuid,
                    'name' => $u->name,
                    'email' => $u->email,
                    'status' => $u->status,
                    'public_key' => $u->public_key,
                    'vault_access' => match (true) {
                        $grants->contains('type', VaultKeyGrant::TYPE_CONFIRMED) => 'confirmed',
                        $grants->contains('type', VaultKeyGrant::TYPE_SEALED) => 'pending_confirmation',
                        default => 'none',
                    },
                    'is_me' => $u->id === $request->user()->id,
                    'last_login_at' => $u->last_login_at?->toIso8601String(),
                    'created_at' => $u->created_at?->toIso8601String(),
                ];
            });

        return response()->json(['data' => $users, 'current_vault_key_version' => $current]);
    }

    /**
     * Donne l'accès au coffre à un admin : clé du coffre scellée pour SA clé publique.
     * L'invitant doit avoir comparé l'empreinte hors bande (affichée par l'interface).
     */
    public function grantVault(VaultGrantStoreRequest $request, string $uuid): JsonResponse
    {
        $target = User::where('uuid', $uuid)->firstOrFail();
        $version = (int) $request->validated('key_version');

        if ($target->id === $request->user()->id || ! $target->isActive()) {
            return response()->json(['message' => 'Action impossible pour ce compte.', 'code' => 'invalid_target'], 422);
        }
        if (! VaultKey::where('version', $version)->where('status', VaultKey::STATUS_ACTIVE)->exists()) {
            return response()->json(['message' => 'Version de clé inconnue.', 'code' => 'invalid_key_version'], 422);
        }
        if (! $request->user()->vaultKeyGrants()->where('key_version', $version)->where('type', VaultKeyGrant::TYPE_CONFIRMED)->exists()) {
            return response()->json(['message' => 'Vous n’avez pas accès à cette version du coffre.', 'code' => 'no_vault_access'], 403);
        }

        VaultKeyGrant::updateOrCreate(
            ['user_id' => $target->id, 'key_version' => $version, 'type' => VaultKeyGrant::TYPE_SEALED],
            ['encrypted_key' => $request->validated('sealed_key'), 'granted_by' => $request->user()->id],
        );

        $request->session()->forget('reauth_at');
        $this->logger->log('vault.access_granted', $request->user(), ['target' => $target->email, 'key_version' => $version]);

        return response()->json(['message' => 'Accès au coffre transmis. Il sera confirmé à la prochaine ouverture de l’admin.'], 201);
    }

    /** L'admin invité confirme son accès : ré-enveloppe la clé du coffre avec sa propre userKey. */
    public function confirmVault(VaultGrantConfirmRequest $request): JsonResponse
    {
        $user = $request->user();
        $version = (int) $request->validated('key_version');

        $confirmed = DB::transaction(function () use ($user, $version, $request) {
            $sealed = $user->vaultKeyGrants()->where('key_version', $version)->where('type', VaultKeyGrant::TYPE_SEALED)->lockForUpdate()->first();
            if ($sealed === null) {
                return false;
            }

            VaultKeyGrant::updateOrCreate(
                ['user_id' => $user->id, 'key_version' => $version, 'type' => VaultKeyGrant::TYPE_CONFIRMED],
                ['encrypted_key' => json_encode($request->validated('encrypted_key')), 'granted_by' => $sealed->granted_by],
            );
            $sealed->delete();

            return true;
        });

        if (! $confirmed) {
            return response()->json(['message' => 'Aucun accès en attente pour cette version.', 'code' => 'no_pending_grant'], 422);
        }

        $this->logger->log('vault.access_confirmed', $user, ['key_version' => $version]);

        return response()->json(['message' => 'Accès au coffre confirmé.']);
    }

    /** Désactive un admin : sessions fermées, appareils révoqués, accès au coffre retirés. */
    public function disable(Request $request, string $uuid): JsonResponse
    {
        $target = User::where('uuid', $uuid)->firstOrFail();

        if ($target->id === $request->user()->id) {
            return response()->json(['message' => 'Vous ne pouvez pas désactiver votre propre compte.', 'code' => 'invalid_target'], 422);
        }
        if (! $target->isActive()) {
            return response()->json(['message' => 'Compte déjà désactivé.', 'code' => 'invalid_target'], 422);
        }

        DB::transaction(function () use ($target) {
            $target->forceFill(['status' => User::STATUS_DISABLED, 'disabled_at' => now()])->save();
            $target->devices()->whereNull('revoked_at')->update(['revoked_at' => now()]);
            $target->vaultKeyGrants()->delete();
            $this->devices->destroyUserSessions($target->id);
        });

        $request->session()->forget('reauth_at');
        $this->logger->log('admin.disabled', $request->user(), ['target' => $target->email]);

        return response()->json([
            'message' => 'Compte désactivé. Recommandé : effectuer une rotation de la clé du coffre.',
            'rotation_recommended' => true,
        ]);
    }
}
