<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\InvitationAcceptRequest;
use App\Http\Requests\Auth\InvitationStartRequest;
use App\Http\Requests\Auth\InvitationStoreRequest;
use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\User;
use App\Services\AccountService;
use App\Services\ActivityLogger;
use App\Services\AuthSessionService;
use App\Services\DeviceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Invitation d'administrateurs (5 comptes max, invitations en cours comprises).
 * L'invité crée ses propres clés ; il n'accède au coffre qu'après que l'invitant
 * a vérifié hors bande son empreinte et lui a scellé la clé du coffre.
 */
class InvitationController extends Controller
{
    public function __construct(
        private readonly AccountService $accounts,
        private readonly DeviceService $devices,
        private readonly AuthSessionService $sessions,
        private readonly ActivityLogger $logger,
    ) {}

    public function index(): JsonResponse
    {
        $invitations = Invitation::with('inviter:id,name')
            ->whereNull('accepted_at')->whereNull('revoked_at')->where('expires_at', '>', now())
            ->latest()->get()
            ->map(fn (Invitation $i) => [
                'uuid' => $i->uuid,
                'email' => $i->email,
                'invited_by' => $i->inviter?->name,
                'expires_at' => $i->expires_at->toIso8601String(),
                'created_at' => $i->created_at->toIso8601String(),
            ]);

        return response()->json(['data' => $invitations]);
    }

    public function store(InvitationStoreRequest $request): JsonResponse
    {
        $email = mb_strtolower($request->validated('email'));

        if (User::where('email', $email)->exists()) {
            return response()->json(['message' => 'Un compte existe déjà avec cette adresse.', 'code' => 'email_taken'], 422);
        }

        $result = DB::transaction(function () use ($email, $request) {
            // Verrou sur les comptes pour un contrôle fiable du plafond.
            User::lockForUpdate()->count();
            if (! $this->accounts->hasFreeSeat()) {
                return null;
            }

            Invitation::where('email', $email)->whereNull('accepted_at')->whereNull('revoked_at')->update(['revoked_at' => now()]);

            $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $invitation = Invitation::create([
                'email' => $email,
                'token_hash' => hash('sha256', $token),
                'invited_by' => $request->user()->id,
                'expires_at' => now()->addHours((int) config('koffra.invitation_ttl_hours')),
            ]);

            return [$invitation, $token];
        });

        if ($result === null) {
            return response()->json([
                'message' => 'Nombre maximal de comptes administrateurs atteint ('.config('koffra.max_accounts').').',
                'code' => 'seat_limit',
            ], 422);
        }

        [$invitation, $token] = $result;
        // Jeton dans le fragment (#) : jamais envoyé au serveur ni dans les journaux HTTP.
        $url = rtrim((string) config('app.frontend_url'), '/').'/invitation#'.$token;
        Mail::to($email)->send(new InvitationMail($request->user()->name, $url, (int) config('koffra.invitation_ttl_hours')));

        $request->session()->forget('reauth_at');
        $this->logger->log('admin.invited', $request->user(), ['email' => $email]);

        return response()->json(['uuid' => $invitation->uuid, 'email' => $email, 'expires_at' => $invitation->expires_at->toIso8601String()], 201);
    }

    public function destroy(Request $request, string $uuid): JsonResponse
    {
        $invitation = Invitation::where('uuid', $uuid)->whereNull('accepted_at')->firstOrFail();
        $invitation->forceFill(['revoked_at' => now()])->save();
        $this->logger->log('admin.invitation_revoked', $request->user(), ['email' => $invitation->email]);

        return response()->json(['message' => 'Invitation annulée.']);
    }

    /** Invité : ouvre le lien → reçoit l'UUID de son futur compte (nécessaire aux données associées). */
    public function start(InvitationStartRequest $request): JsonResponse
    {
        $invitation = $this->pendingByToken($request->validated('token'));
        if ($invitation === null) {
            return $this->invalid();
        }

        $userUuid = (string) Str::uuid();
        $request->session()->put('invite', ['invitation_id' => $invitation->id, 'user_uuid' => $userUuid]);

        return response()->json([
            'email' => $invitation->email,
            'invited_by' => $invitation->inviter?->name,
            'user_uuid' => $userUuid,
            'kdf_defaults' => ['ops' => (int) config('koffra.kdf.default_ops'), 'mem' => (int) config('koffra.kdf.default_mem')],
        ]);
    }

    public function accept(InvitationAcceptRequest $request): JsonResponse
    {
        $invite = $request->session()->get('invite');
        if (! is_array($invite)) {
            return $this->invalid();
        }

        $data = $request->validated();

        $result = DB::transaction(function () use ($invite, $data, $request) {
            $invitation = Invitation::lockForUpdate()->find($invite['invitation_id']);
            if ($invitation === null || ! $invitation->isPending() || User::where('email', $invitation->email)->exists()) {
                return null;
            }

            $user = $this->accounts->createUser([
                ...$data,
                'uuid' => $invite['user_uuid'],
                'email' => $invitation->email,
            ], $invitation->inviter);

            $invitation->forceFill(['accepted_at' => now(), 'user_id' => $user->id])->save();

            // Le lien reçu par email prouve la possession de l'adresse : appareil approuvé.
            [$device, $token] = $this->devices->createPending($user, $data['device_label'], $request);
            $this->devices->approve($device, $request);

            return [$user, $device, $token];
        });

        if ($result === null) {
            $request->session()->forget('invite');

            return $this->invalid();
        }

        [$user, $device, $token] = $result;
        $this->logger->log('admin.invitation_accepted', $user, [], $device->id);

        return $this->sessions->open($request, $user, $device, $token, 'auth.login', 201);
    }

    private function pendingByToken(string $token): ?Invitation
    {
        $invitation = Invitation::with('inviter:id,name')->where('token_hash', hash('sha256', $token))->first();

        return $invitation?->isPending() ? $invitation : null;
    }

    private function invalid(): JsonResponse
    {
        return response()->json(['message' => 'Invitation invalide, expirée ou déjà utilisée.', 'code' => 'invitation_invalid'], 422);
    }
}
