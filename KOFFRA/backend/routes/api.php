<?php

use Illuminate\Support\Facades\Route;

/*
| API KOFFRA — préfixe /api/v1 (défini dans bootstrap/app.php).
*/

Route::get('/health', fn () => response()->json([
    'status' => 'ok',
    'service' => 'koffra-api',
    'version' => 'v1',
]));
