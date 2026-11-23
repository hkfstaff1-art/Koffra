<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\TrustedDevice;
use App\Models\User;
use App\Models\VaultItem;
use App\Models\VaultKey;
use App\Models\VaultKeyGrant;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use LogicException;
use Tests\TestCase;

class DataModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_uuids_are_random_v4_and_used_as_route_keys(): void
    {
        $user = User::factory()->create();
        $item = VaultItem::factory()->create();

        $this->assertMatchesRegularExpression('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $user->uuid);
        $this->assertSame('uuid', $item->getRouteKeyName());
        $this->assertNotSame($user->uuid, User::factory()->create()->uuid);
    }

    public function test_sensitive_and_internal_columns_are_never_serialized(): void
    {
        $user = User::factory()->create();
        $json = $user->toArray();

        foreach (['id', 'password', 'kdf_params', 'encrypted_user_key', 'encrypted_private_key'] as $hidden) {
            $this->assertArrayNotHasKey($hidden, $json);
        }
        $this->assertArrayHasKey('uuid', $json);
        $this->assertArrayNotHasKey('device_token_hash', TrustedDevice::create([
            'user_id' => $user->id, 'device_label' => 'PC', 'device_token_hash' => str_repeat('a', 64),
        ])->toArray());
    }

    public function test_auth_key_is_stored_as_an_argon2id_hash(): void
    {
        $user = User::factory()->create(['password' => 'clé-d-authentification-factice']);

        $this->assertStringStartsWith('$argon2id$', $user->getAuthPassword());
        $this->assertStringNotContainsString('factice', DB::table('users')->where('id', $user->id)->value('password'));
    }

    public function test_activity_log_is_append_only(): void
    {
        $log = ActivityLog::create(['event_type' => 'test.event', 'metadata' => ['a' => 1]]);

        $this->expectException(LogicException::class);
        $log->update(['event_type' => 'modifié']);
    }

    public function test_activity_log_cannot_be_deleted(): void
    {
        $log = ActivityLog::create(['event_type' => 'test.event']);

        $this->expectException(LogicException::class);
        $log->delete();
    }

    public function test_vault_items_go_to_trash_and_can_be_restored(): void
    {
        $item = VaultItem::factory()->create();
        $item->delete();

        $this->assertSoftDeleted($item);
        $this->assertSame(0, VaultItem::count());

        $item->restore();
        $this->assertSame(1, VaultItem::count());
    }

    public function test_deleting_a_category_keeps_its_items(): void
    {
        $category = Category::factory()->create();
        $item = VaultItem::factory()->create(['category_id' => $category->id]);

        $category->delete();

        $this->assertNull($item->fresh()->category_id);
    }

    public function test_a_grant_requires_an_existing_key_version_and_is_unique_per_user_version_type(): void
    {
        $user = User::factory()->create();
        VaultKey::create(['version' => 1]);

        VaultKeyGrant::create(['user_id' => $user->id, 'key_version' => 1, 'type' => 'confirmed', 'encrypted_key' => '{}']);

        try {
            VaultKeyGrant::create(['user_id' => $user->id, 'key_version' => 1, 'type' => 'confirmed', 'encrypted_key' => '{}']);
            $this->fail('Doublon accepté');
        } catch (QueryException) {
            $this->assertSame(1, VaultKeyGrant::count());
        }

        if (DB::getDriverName() !== 'sqlite') { // SQLite n'applique pas les FK par défaut en test
            $this->expectException(QueryException::class);
            VaultKeyGrant::create(['user_id' => $user->id, 'key_version' => 99, 'type' => 'confirmed', 'encrypted_key' => '{}']);
        }
    }

    public function test_deleting_a_user_removes_their_devices_and_grants(): void
    {
        $user = User::factory()->create();
        VaultKey::create(['version' => 1]);
        TrustedDevice::create(['user_id' => $user->id, 'device_label' => 'PC', 'device_token_hash' => str_repeat('b', 64)]);
        VaultKeyGrant::create(['user_id' => $user->id, 'key_version' => 1, 'type' => 'confirmed', 'encrypted_key' => '{}']);

        $user->delete();

        $this->assertSame(0, TrustedDevice::count());
        $this->assertSame(0, VaultKeyGrant::count());
    }

    public function test_current_vault_key_is_the_latest_active_version(): void
    {
        VaultKey::create(['version' => 1, 'status' => VaultKey::STATUS_RETIRED]);
        VaultKey::create(['version' => 2]);
        VaultKey::create(['version' => 3, 'status' => VaultKey::STATUS_ROTATING]);

        $this->assertSame(2, VaultKey::current()->version);
    }

    public function test_vault_tables_have_no_plaintext_secret_columns(): void
    {
        $columns = Schema::getColumnListing('vault_items');
        foreach (['title', 'password', 'secret', 'username', 'notes', 'url'] as $forbidden) {
            $this->assertNotContains($forbidden, $columns);
        }
        $this->assertNotContains('name', Schema::getColumnListing('categories'));
        $this->assertNotContains('mime_type', Schema::getColumnListing('attachments'));
    }

    public function test_all_tables_use_innodb_on_mysql_and_mariadb(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $this->markTestSkipped('Spécifique MySQL/MariaDB');
        }

        $engines = DB::table('information_schema.tables')
            ->where('table_schema', DB::getDatabaseName())
            ->selectRaw('ENGINE as engine_name')
            ->pluck('engine_name')
            ->unique()
            ->values()
            ->all();

        $this->assertSame(['InnoDB'], $engines);
    }
}
