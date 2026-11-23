<?php

use Illuminate\Support\Facades\Route;

// Le backend est une API pure : l'interface est servie par le frontend React.
Route::get('/', fn () => response()->json(['service' => 'koffra-api']));
