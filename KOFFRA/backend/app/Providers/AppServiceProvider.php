<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use RuntimeException;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        $this->guardProductionConfiguration();
        $this->configureRateLimiting();
    }

    /** Refuse de démarrer en production avec une configuration dangereuse. */
    private function guardProductionConfiguration(): void
    {
        if (! $this->app->isProduction()) {
            return;
        }

        if (in_array(config('mail.default'), ['log', 'array'], true)) {
            throw new RuntimeException('KOFFRA : MAIL_MAILER=log/array interdit en production (les codes OTP seraient écrits sur disque).');
        }
        if (config('app.debug')) {
            throw new RuntimeException('KOFFRA : APP_DEBUG doit être false en production.');
        }
        if (! config('session.secure')) {
            throw new RuntimeException('KOFFRA : SESSION_SECURE_COOKIE doit être true en production (HTTPS).');
        }
    }

    private function configureRateLimiting(): void
    {
        $byIp = fn (Request $r) => $r->ip() ?? 'unknown';

        // Requêtes publiques sensibles (installation, prélogin, invitations, récupération)
        RateLimiter::for('auth', fn (Request $r) => Limit::perMinute(20)->by($byIp($r)));

        // Tentatives de connexion : par email ET par IP
        RateLimiter::for('login', fn (Request $r) => [
            Limit::perMinute(5)->by('email:'.mb_strtolower((string) $r->input('email'))),
            Limit::perMinute(10)->by('ip:'.$byIp($r)),
        ]);

        // Réauthentification (utilisateur connecté) : compteur par compte
        RateLimiter::for('reauth', fn (Request $r) => Limit::perMinute(10)->by('reauth:'.($r->user()?->id ?? $byIp($r))));

        // Saisie de codes OTP
        RateLimiter::for('otp', fn (Request $r) => Limit::perMinute(10)->by($byIp($r)));

        // API authentifiée
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute(300)->by($r->user()?->id ?: $byIp($r)));
    }
}
