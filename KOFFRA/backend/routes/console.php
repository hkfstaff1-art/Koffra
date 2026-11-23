<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schedule;

/*
| Tâches planifiées. Sur Hostinger : une tâche cron chaque minute
|   /usr/bin/php /home/u590111860/apps/koffra/artisan schedule:run >> /dev/null 2>&1
| (voir docs/11). Contrôle : php artisan koffra:status
*/

// Battement de cœur : prouve que le cron du serveur exécute bien le planificateur.
Schedule::call(fn () => Cache::forever('koffra:scheduler:heartbeat', now()->toIso8601String()))
    ->everyMinute()
    ->name('koffra-heartbeat');

Schedule::command('koffra:prune')->dailyAt('03:15');
Schedule::command('queue:work --stop-when-empty --tries=3')->everyMinute()->withoutOverlapping();
