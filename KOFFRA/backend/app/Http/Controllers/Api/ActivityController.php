<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Journal d'activité (pagination serveur). Ne contient aucune valeur secrète. */
class ActivityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'event' => ['nullable', 'string', 'max:60', 'regex:/^[a-z_.]+$/'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $page = ActivityLog::with(['user:id,uuid,name', 'device:id,device_label'])
            ->when($validated['event'] ?? null, fn ($q, $e) => $q->where('event_type', 'like', $e.'%'))
            ->orderByDesc('id')
            ->paginate($validated['per_page'] ?? 50);

        return response()->json([
            'data' => collect($page->items())->map(fn (ActivityLog $log) => [
                'id' => $log->id,
                'event' => $log->event_type,
                'user' => $log->user ? ['uuid' => $log->user->uuid, 'name' => $log->user->name] : null,
                'device' => $log->device?->device_label,
                'ip' => $log->ip_truncated,
                'metadata' => $log->metadata,
                'created_at' => $log->created_at?->toIso8601String(),
            ]),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ]);
    }
}
