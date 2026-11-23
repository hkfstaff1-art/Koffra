<?php

namespace Tests\Feature;

use App\Models\OtpChallenge;
use App\Models\TrustedDevice;
use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PruneCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_expired_security_records_are_pruned_and_valid_ones_kept(): void
    {
        $user = User::factory()->create();
        $make = fn ($expires) => OtpChallenge::create([
            'user_id' => $user->id, 'purpose' => 'login', 'channel' => 'email', 'destination_masked' => 'x',
            'code_hash' => 'h', 'expires_at' => $expires, 'max_attempts' => 5,
        ]);
        $old = $make(now()->subDays(2));
        $fresh = $make(now()->addMinutes(5));

        $pending = TrustedDevice::create(['user_id' => $user->id, 'device_label' => 'vieux', 'device_token_hash' => str_repeat('d', 64)]);
        $pending->forceFill(['created_at' => now()->subDays(8)])->save();
        $approved = TrustedDevice::create(['user_id' => $user->id, 'device_label' => 'ok', 'device_token_hash' => str_repeat('e', 64), 'approved_at' => now()->subYear()]);
        $approved->forceFill(['created_at' => now()->subYear()])->save();

        $this->artisan('koffra:prune')->assertSuccessful();

        $this->assertModelMissing($old);
        $this->assertModelExists($fresh);
        $this->assertModelMissing($pending);
        $this->assertModelExists($approved);
    }

    public function test_prune_is_scheduled_daily(): void
    {
        $events = collect(app(Schedule::class)->events())->map->command->implode(' ');
        $this->assertStringContainsString('koffra:prune', $events);
    }
}
