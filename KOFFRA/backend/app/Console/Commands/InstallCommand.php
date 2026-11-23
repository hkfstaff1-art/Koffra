<?php

namespace App\Console\Commands;

use App\Models\InstallationToken;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Génère le lien d'initialisation du premier propriétaire (usage unique, 30 minutes).
 * À lancer par la personne qui administre le serveur ; le lien n'est affiché qu'ici.
 */
class InstallCommand extends Command
{
    protected $signature = 'koffra:install';

    protected $description = 'Génère le lien à usage unique pour créer le compte propriétaire KOFFRA';

    public function handle(): int
    {
        if (User::exists()) {
            $this->error('KOFFRA est déjà initialisé : un compte propriétaire existe. Utilisez les invitations depuis l’application.');

            return self::FAILURE;
        }

        // Un seul lien valide à la fois
        InstallationToken::whereNull('used_at')->update(['expires_at' => now()]);

        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $ttl = (int) config('koffra.installation_token_ttl_minutes');

        InstallationToken::create([
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addMinutes($ttl),
        ]);

        $url = rtrim((string) config('app.frontend_url'), '/').'/installation#'.$token;

        $this->info('Lien d’initialisation du propriétaire (valable '.$ttl.' minutes, usage unique) :');
        $this->line($url);
        $this->warn('Ne partagez pas ce lien. Ouvrez-le vous-même, en HTTPS, sur l’appareil du propriétaire.');

        return self::SUCCESS;
    }
}
