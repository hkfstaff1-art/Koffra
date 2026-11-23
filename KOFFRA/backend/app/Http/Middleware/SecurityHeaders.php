<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ajoute les en-têtes de sécurité HTTP à toutes les réponses de l'API.
 *
 * L'API ne sert que du JSON : la CSP est donc la plus stricte possible.
 * La CSP de l'application React est définie séparément (frontend / serveur web).
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        $headers = $response->headers;
        // CSP la plus stricte par défaut ; l'application React fournit la sienne (SpaController).
        if (! $headers->has('Content-Security-Policy')) {
            $headers->set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        }
        $headers->set('X-Content-Type-Options', 'nosniff');
        $headers->set('X-Frame-Options', 'DENY');
        $headers->set('Referrer-Policy', 'no-referrer');
        $headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        $headers->set('Cross-Origin-Opener-Policy', 'same-origin');
        $headers->set('Cross-Origin-Resource-Policy', 'same-site');

        // Les réponses de l'API peuvent contenir des données chiffrées du coffre :
        // aucune mise en cache (navigateur, proxy, service worker).
        if ($request->is('api/*')) {
            $headers->set('Cache-Control', 'no-store, max-age=0');
            $headers->set('Pragma', 'no-cache');
        }

        // HSTS uniquement en HTTPS (sinon ignoré par les navigateurs et gênant en dev).
        if ($request->isSecure()) {
            $headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        $headers->remove('X-Powered-By');

        return $response;
    }
}
