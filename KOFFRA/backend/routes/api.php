<?php

use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\Api\RecoveryController;
use App\Http\Controllers\Api\SetupController;
use Illuminate\Support\Facades\Route;

/*
| API KOFFRA — préfixe /api/v1 (bootstrap/app.php). Documentation : docs/openapi.yaml
*/

Route::get('/health', fn () => response()->json([
    'status' => 'ok',
    'service' => 'koffra-api',
    'version' => 'v1',
]));

// --- Public (non authentifié) -------------------------------------------------
Route::middleware('throttle:auth')->group(function () {
    Route::get('/setup/status', [SetupController::class, 'status']);
    Route::post('/setup/start', [SetupController::class, 'start']);
    Route::post('/setup/complete', [SetupController::class, 'complete'])->middleware('throttle:otp');

    Route::post('/auth/prelogin', [AuthController::class, 'prelogin']);

    Route::post('/recovery/start', [RecoveryController::class, 'start'])->middleware('throttle:login');
    Route::post('/recovery/verify', [RecoveryController::class, 'verify'])->middleware('throttle:otp');
    Route::post('/recovery/complete', [RecoveryController::class, 'complete']);

    Route::post('/invitations/accept/start', [InvitationController::class, 'start']);
    Route::post('/invitations/accept', [InvitationController::class, 'accept']);
});

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/auth/otp/verify', [AuthController::class, 'verifyOtp'])->middleware('throttle:otp');
Route::post('/auth/otp/resend', [AuthController::class, 'resendOtp'])->middleware('throttle:otp');

// --- Authentifié (session + appareil approuvé) ---------------------------------
Route::middleware(['auth:sanctum', 'trusted.device', 'throttle:api'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/auth/reauth', [AuthController::class, 'reauth'])->middleware('throttle:reauth');

    Route::get('/me', [MeController::class, 'show']);

    Route::get('/devices', [DeviceController::class, 'index']);
    Route::delete('/devices/{uuid}', [DeviceController::class, 'destroy'])->whereUuid('uuid');
    Route::post('/devices/logout-others', [DeviceController::class, 'logoutOthers']);

    Route::get('/admins', [AdminUserController::class, 'index']);
    Route::post('/vault-grants/confirm', [AdminUserController::class, 'confirmVault']);
    Route::get('/invitations', [InvitationController::class, 'index']);
    Route::get('/activity', [ActivityController::class, 'index']);

    // Actions sensibles : réauthentification récente obligatoire
    Route::middleware('reauth')->group(function () {
        Route::put('/me/password', [MeController::class, 'updatePassword']);
        Route::post('/me/recovery-key', [MeController::class, 'regenerateRecoveryKey']);
        Route::post('/invitations', [InvitationController::class, 'store']);
        Route::delete('/invitations/{uuid}', [InvitationController::class, 'destroy'])->whereUuid('uuid');
        Route::post('/admins/{uuid}/vault-grant', [AdminUserController::class, 'grantVault'])->whereUuid('uuid');
        Route::delete('/admins/{uuid}', [AdminUserController::class, 'disable'])->whereUuid('uuid');
    });
});
