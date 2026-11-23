<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\PasswordUpdateRequest;
use App\Http\Requests\Auth\RecoveryKeyRequest;
use App\Services\AccountService;
use App\Services\ActivityLogger;
use App\Services\AuthSessionService;
use App\Services\DeviceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    public function __construct(
        private readonly AccountService $accounts,
        private readonly AuthSessionService $sessions,
        private readonly DeviceService $devices,
        private readonly ActivityLogger $logger,
    ) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->sessions->mePayload($request->user(), $request->attributes->get('device')));
    }

    /** Changement de mot de passe : nouvelle authKey + nouvelle enveloppe de la userKey. */
    public function updatePassword(PasswordUpdateRequest $request): JsonResponse
    {
        $user = $request->user();
        $this->accounts->updatePassword($user, $request->validated());

        // Les autres sessions sont fermées ; la session courante est conservée.
        $this->devices->destroyUserSessions($user->id, $request->session()->getId());
        $request->session()->forget('reauth_at');
        $this->logger->log('security.password_changed', $user);

        return response()->json(['message' => 'Mot de passe modifié. Les autres sessions ont été fermées.']);
    }

    /** Nouvelle clé de récupération : l'ancienne est révoquée. */
    public function regenerateRecoveryKey(RecoveryKeyRequest $request): JsonResponse
    {
        $user = $request->user();
        $this->accounts->storeRecovery($user, $request->validated('recovery'));
        $request->session()->forget('reauth_at');
        $this->logger->log('security.recovery_key_regenerated', $user);

        return response()->json(['message' => 'Nouvelle clé de récupération enregistrée. L’ancienne ne fonctionne plus.']);
    }
}
