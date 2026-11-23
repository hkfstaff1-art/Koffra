<?php

use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\Api\RecoveryController;
use App\Http\Controllers\Api\SetupController;
use App\Http\Controllers\Api\VaultItemController;
use App\Http\Controllers\Api\VaultKeyController;
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

    // --- Coffre partagé : accès confirmé à la clé active exigé ---------------------
    Route::middleware('can:access-vault')->group(function () {
        Route::get('/vault-items', [VaultItemController::class, 'index']);
        Route::post('/vault-items', [VaultItemController::class, 'store']);
        Route::get('/vault-items/{uuid}', [VaultItemController::class, 'show'])->whereUuid('uuid');
        Route::patch('/vault-items/{uuid}', [VaultItemController::class, 'update'])->whereUuid('uuid');
        Route::delete('/vault-items/{uuid}', [VaultItemController::class, 'destroy'])->whereUuid('uuid');
        Route::post('/vault-items/{uuid}/restore', [VaultItemController::class, 'restore'])->whereUuid('uuid');

        Route::get('/categories', [CategoryController::class, 'index']);
        Route::post('/categories', [CategoryController::class, 'store']);
        Route::patch('/categories/{uuid}', [CategoryController::class, 'update'])->whereUuid('uuid');
        Route::delete('/categories/{uuid}', [CategoryController::class, 'destroy'])->whereUuid('uuid');

        Route::post('/vault-items/{uuid}/attachments', [AttachmentController::class, 'store'])->whereUuid('uuid');
        Route::get('/attachments/{uuid}', [AttachmentController::class, 'show'])->whereUuid('uuid');
        Route::delete('/attachments/{uuid}', [AttachmentController::class, 'destroy'])->whereUuid('uuid');

        Route::get('/vault-keys/status', [VaultKeyController::class, 'status']);
        Route::post('/vault-keys/{version}/activate', [VaultKeyController::class, 'activate'])->whereNumber('version');
        Route::post('/vault-keys/{version}/abort', [VaultKeyController::class, 'abort'])->whereNumber('version');

        Route::middleware('reauth')->group(function () {
            Route::delete('/vault-items/{uuid}/force', [VaultItemController::class, 'forceDestroy'])->whereUuid('uuid');
            Route::post('/vault-keys', [VaultKeyController::class, 'start']);
            Route::post('/exports/encrypted', [ExportController::class, 'store']);
        });
    });
});
