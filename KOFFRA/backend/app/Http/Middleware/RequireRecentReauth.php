<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Actions sensibles (export, invitation, sécurité, désactivation d'admin) :
 * exigent une réauthentification récente (POST /auth/reauth).
 */
class RequireRecentReauth
{
    public const WINDOW_SECONDS = 300;

    public function handle(Request $request, Closure $next): Response
    {
        $at = (int) $request->session()->get('reauth_at', 0);

        if ($at === 0 || now()->timestamp - $at > self::WINDOW_SECONDS) {
            return response()->json([
                'message' => 'Confirmez votre mot de passe pour continuer.',
                'code' => 'reauth_required',
            ], 403);
        }

        return $next($request);
    }
}
