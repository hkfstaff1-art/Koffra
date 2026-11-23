<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

/**
 * Sert l'application React (build copié dans public/ par infra/scripts/build-release.sh,
 * index.html renommé spa.html) sur le même domaine que l'API : cookies SameSite=Strict possibles.
 */
class SpaController extends Controller
{
    /**
     * CSP de l'application : aucun script externe ni inline. 'wasm-unsafe-eval' est requis par
     * libsodium (WebAssembly) ; les styles inline sont limités aux attributs générés par React.
     */
    public const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
        ."img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; "
        ."object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

    public function __invoke(): Response
    {
        $path = public_path('spa.html');

        if (! is_file($path)) {
            return response('Interface KOFFRA non déployée : lancez infra/scripts/build-release.sh.', 503, [
                'Content-Type' => 'text/plain; charset=UTF-8',
            ]);
        }

        return response((string) file_get_contents($path), 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Content-Security-Policy' => self::CSP,
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
        ]);
    }
}
