<?php

use Illuminate\Support\Facades\Schedule;

/*
| Tâches planifiées. Sur Hostinger : une tâche cron chaque minute
|   php /home/<compte>/koffra/artisan schedule:run >> /dev/null 2>&1
| (voir docs/11-deploiement-hostinger.md).
*/

Schedule::command('koffra:prune')->dailyAt('03:15');
Schedule::command('queue:work --stop-when-empty --tries=3')->everyMinute()->withoutOverlapping();
