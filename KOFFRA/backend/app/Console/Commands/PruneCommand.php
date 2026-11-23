<?php

namespace App\Console\Commands;

use App\Models\InstallationToken;
use App\Models\Invitation;
use App\Models\OtpChallenge;
use App\Models\TrustedDevice;
use Illuminate\Console\Command;

/** Nettoyage quotidien des éléments de sécurité expirés (planifié dans routes/console.php). */
class PruneCommand extends Command
{
    protected $signature = 'koffra:prune';

    protected $description = 'Supprime codes OTP, jetons, invitations et appareils non approuvés expirés';

    public function handle(): int
    {
        $otp = OtpChallenge::where('expires_at', '<', now()->subDay())->delete();
        $tokens = InstallationToken::where('expires_at', '<', now()->subDay())->delete();
        $invitations = Invitation::whereNull('accepted_at')->where('expires_at', '<', now()->subDays(30))->delete();
        // Appareils jamais approuvés (code non saisi) au-delà de 7 jours
        $devices = TrustedDevice::whereNull('approved_at')->where('created_at', '<', now()->subDays(7))->delete();

        $this->info("Supprimés : $otp code(s), $tokens jeton(s), $invitations invitation(s), $devices appareil(s) en attente.");

        return self::SUCCESS;
    }
}
