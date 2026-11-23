<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/** État d'exploitation : planificateur (cron) et installation. */
class StatusCommand extends Command
{
    protected $signature = 'koffra:status';

    protected $description = 'Affiche l’état du planificateur (cron) et de l’installation KOFFRA';

    public function handle(): int
    {
        $beat = Cache::get('koffra:scheduler:heartbeat');
        $installed = User::exists();
        $this->line('Compte propriétaire créé : '.($installed ? 'oui' : 'non'));

        if ($beat === null) {
            $this->error('Planificateur : jamais exécuté (tâche cron absente ou incorrecte).');

            return self::FAILURE;
        }

        $age = (int) Carbon::parse($beat)->diffInSeconds(now(), true);
        if ($age > 180) {
            $this->error("Planificateur : dernier passage il y a {$age} s (cron arrêté ?).");

            return self::FAILURE;
        }

        $this->info("Planificateur : OK (dernier passage il y a {$age} s, à {$beat}).");

        return self::SUCCESS;
    }
}
