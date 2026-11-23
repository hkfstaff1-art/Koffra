<?php

use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

// Application React (routes côté client). Les fichiers statiques (assets, sw.js…) sont servis
// directement par le serveur web ; /api, /sanctum et /up restent gérés par Laravel.
Route::get('/{path?}', SpaController::class)
    ->where('path', '^(?!api/|api$|sanctum/|up$).*$')
    ->name('spa');
