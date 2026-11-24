<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Attachment;
use App\Models\Category;
use App\Models\User;
use App\Models\VaultItem;
use App\Models\VaultKey;
use App\Models\VaultKeyGrant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Concerns\InteractsWithKoffraApi;
use Tests\TestCase;

class VaultApiTest extends TestCase
{
    use InteractsWithKoffraApi, RefreshDatabase;

    private string $key;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['session.driver' => 'database']);
        Mail::fake();
        Storage::fake('local');
        $this->key = self::b64(32);
        $this->owner = $this->createAdmin($this->key);
        $this->loginWithOtp($this->owner, $this->key);
    }

    private function newItem(array $overrides = []): array
    {
        return ['uuid' => (string) Str::uuid(), 'key_version' => 1, 'payload' => self::envelope(), ...$overrides];
    }

    private function reauth(): void
    {
        $this->api('POST', '/auth/reauth', ['auth_key' => $this->key])->assertOk();
    }

    public function test_vault_requires_authentication_and_confirmed_access(): void
    {
        $ownerCookies = $this->browserCookies;
        $this->newBrowser();
        $this->api('GET', '/vault-items')->assertUnauthorized();

        // Admin dont l'accès est seulement « scellé » (non confirmé) : refusé
        $pendingKey = self::b64(32);
        $pending = User::factory()->create(['password' => $pendingKey]);
        VaultKeyGrant::create(['user_id' => $pending->id, 'key_version' => 1, 'type' => 'sealed', 'encrypted_key' => self::b64(84)]);
        $this->loginWithOtp($pending, $pendingKey, 'PC invité');
        $this->api('GET', '/vault-items')->assertForbidden();
        $this->api('POST', '/vault-items', $this->newItem())->assertForbidden();

        $this->browserCookies = $ownerCookies;
        $this->api('GET', '/vault-items')->assertOk();
    }

    public function test_items_are_stored_and_returned_as_opaque_ciphertext(): void
    {
        $item = $this->newItem(['favorite' => true]);
        $this->api('POST', '/vault-items', $item)->assertCreated()
            ->assertJsonPath('data.uuid', $item['uuid'])
            ->assertJsonPath('data.payload', $item['payload'])
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.favorite', true);

        $row = VaultItem::where('uuid', $item['uuid'])->firstOrFail();
        $this->assertSame($item['payload']['c'], $row->ciphertext);
        $this->assertSame($item['payload']['n'], $row->nonce);

        $list = $this->api('GET', '/vault-items')->assertOk();
        $this->assertSame(1, $list->json('meta.total'));
        $this->assertArrayNotHasKey('id', $list->json('data.0'));

        // UUID réutilisé, enveloppe invalide, version de clé inconnue
        $this->api('POST', '/vault-items', $item)->assertStatus(422);
        $this->api('POST', '/vault-items', $this->newItem(['payload' => ['v' => 1, 'n' => 'court', 'c' => 'x']]))->assertStatus(422);
        $this->api('POST', '/vault-items', $this->newItem(['payload' => ['v' => 2, ...array_slice(self::envelope(), 1)]]))->assertStatus(422);
        $this->api('POST', '/vault-items', $this->newItem(['key_version' => 7]))->assertStatus(409)->assertJson(['code' => 'stale_key_version']);
    }

    public function test_concurrent_edits_are_detected_with_revisions(): void
    {
        $item = $this->newItem();
        $this->api('POST', '/vault-items', $item)->assertCreated();

        $this->api('PATCH', "/vault-items/{$item['uuid']}", ['revision' => 1, 'payload' => self::envelope(), 'key_version' => 1])
            ->assertOk()->assertJsonPath('data.revision', 2);

        // Un second admin qui avait chargé la révision 1 ne peut pas écraser la modification
        $this->api('PATCH', "/vault-items/{$item['uuid']}", ['revision' => 1, 'payload' => self::envelope(), 'key_version' => 1])
            ->assertStatus(409)->assertJson(['code' => 'revision_conflict']);

        $this->api('PATCH', "/vault-items/{$item['uuid']}", ['revision' => 2, 'favorite' => true, 'archived' => true])
            ->assertOk()->assertJsonPath('data.favorite', true)->assertJsonPath('data.revision', 3);
        $this->assertNotNull(VaultItem::where('uuid', $item['uuid'])->value('archived_at'));
    }

    public function test_trash_restore_and_permanent_delete(): void
    {
        $item = $this->newItem();
        $this->api('POST', '/vault-items', $item)->assertCreated();

        $this->api('DELETE', "/vault-items/{$item['uuid']}")->assertOk();
        $this->assertSame(0, $this->api('GET', '/vault-items')->json('meta.total'));
        $this->assertSame(1, $this->api('GET', '/vault-items?trashed=only')->json('meta.total'));

        $this->api('POST', "/vault-items/{$item['uuid']}/restore")->assertOk();
        $this->assertSame(1, $this->api('GET', '/vault-items')->json('meta.total'));

        $this->api('DELETE', "/vault-items/{$item['uuid']}")->assertOk();
        $this->api('DELETE', "/vault-items/{$item['uuid']}/force")->assertForbidden(); // réauth exigée
        $this->reauth();
        $this->api('DELETE', "/vault-items/{$item['uuid']}/force")->assertOk();
        $this->assertSame(0, VaultItem::withTrashed()->count());
    }

    public function test_purge_deletes_only_trashed_items_with_a_single_reauth(): void
    {
        $a = $this->newItem();
        $b = $this->newItem();
        $kept = $this->newItem();
        foreach ([$a, $b, $kept] as $item) {
            $this->api('POST', '/vault-items', $item)->assertCreated();
        }
        $this->api('DELETE', "/vault-items/{$a['uuid']}")->assertOk();
        $this->api('DELETE', "/vault-items/{$b['uuid']}")->assertOk();

        $uuids = [$a['uuid'], $b['uuid'], $kept['uuid']];
        $this->api('POST', '/vault-items/purge', ['uuids' => $uuids])->assertForbidden(); // réauth exigée
        $this->reauth();
        $this->api('POST', '/vault-items/purge', ['uuids' => $uuids])->assertOk()->assertJson(['deleted' => 2]);

        // L'entrée active n'est jamais supprimée, et la réauthentification est consommée.
        $this->assertSame([$kept['uuid']], VaultItem::withTrashed()->pluck('uuid')->all());
        $this->api('POST', '/vault-items/purge', ['uuids' => [$kept['uuid']]])->assertForbidden();
        $this->api('POST', '/vault-items/purge', ['uuids' => []])->assertForbidden();
    }

    public function test_categories_have_encrypted_names_and_deletion_keeps_items(): void
    {
        $cat = ['uuid' => (string) Str::uuid(), 'key_version' => 1, 'name' => self::envelope(), 'icon' => 'cle-api'];
        $this->api('POST', '/categories', $cat)->assertCreated()->assertJsonPath('data.name', $cat['name']);
        $this->api('POST', '/categories', [...$cat, 'uuid' => (string) Str::uuid(), 'icon' => '<script>'])->assertStatus(422);

        $item = $this->newItem(['category_uuid' => $cat['uuid']]);
        $this->api('POST', '/vault-items', $item)->assertCreated()->assertJsonPath('data.category_uuid', $cat['uuid']);

        $this->api('PATCH', "/categories/{$cat['uuid']}", ['name' => self::envelope(), 'key_version' => 1, 'sort_order' => 3])
            ->assertOk()->assertJsonPath('data.sort_order', 3);

        $this->api('DELETE', "/categories/{$cat['uuid']}")->assertOk();
        $this->api('GET', "/vault-items/{$item['uuid']}")->assertOk()->assertJsonPath('data.category_uuid', null);
        $this->assertSame(0, Category::count());
    }

    public function test_encrypted_attachments_upload_download_and_cleanup(): void
    {
        $item = $this->newItem();
        $this->api('POST', '/vault-items', $item)->assertCreated();

        $blob = random_bytes(5000);
        $uuid = (string) Str::uuid();
        $upload = fn (string $sha, string $content = '') => $this->apiMultipart("/vault-items/{$item['uuid']}/attachments", [
            'uuid' => $uuid,
            'ciphertext_sha256' => $sha,
            'file' => UploadedFile::fake()->createWithContent('x.bin', $content ?: $blob),
        ]);

        $upload(hash('sha256', 'autre chose'))->assertStatus(422)->assertJson(['code' => 'checksum_mismatch']);
        $upload(hash('sha256', 'court'), 'court')->assertStatus(422)->assertJson(['code' => 'invalid_attachment']);
        $upload(hash('sha256', $blob))->assertCreated()->assertJsonPath('encrypted_size', 5000);

        $attachment = Attachment::firstOrFail();
        Storage::disk('local')->assertExists($attachment->storage_key);
        $this->assertStringNotContainsString('x.bin', $attachment->storage_key);

        $download = $this->api('GET', "/attachments/{$uuid}")->assertOk()->assertHeader('Content-Type', 'application/octet-stream');
        $this->assertSame($blob, $download->getContent());

        // Suppression définitive de l'entrée → fichier effacé du disque
        $this->api('DELETE', "/vault-items/{$item['uuid']}")->assertOk();
        $this->reauth();
        $this->api('DELETE', "/vault-items/{$item['uuid']}/force")->assertOk();
        Storage::disk('local')->assertMissing($attachment->storage_key);
    }

    public function test_key_rotation_reencrypts_everything_before_activation(): void
    {
        $otherKey = self::b64(32);
        $other = $this->createAdmin($otherKey);
        $item = $this->newItem();
        $this->api('POST', '/vault-items', $item)->assertCreated();
        $cat = ['uuid' => (string) Str::uuid(), 'key_version' => 1, 'name' => self::envelope()];
        $this->api('POST', '/categories', $cat)->assertCreated();

        $start = ['version' => 2, 'own_grant' => self::envelope(), 'sealed_grants' => [['user_uuid' => $other->uuid, 'sealed_key' => self::b64(84)]]];
        $this->api('POST', '/vault-keys', $start)->assertForbidden(); // réauth
        $this->reauth();
        $this->api('POST', '/vault-keys', [...$start, 'sealed_grants' => []])->assertStatus(422); // l'autre admin serait exclu
        $this->reauth();
        $this->api('POST', '/vault-keys', $start)->assertCreated()->assertJsonPath('remaining', ['items' => 1, 'categories' => 1]);

        $this->api('POST', '/vault-keys/2/activate')->assertStatus(409)->assertJson(['code' => 'rotation_incomplete']);

        // Re-chiffrement côté client
        $this->api('PATCH', "/vault-items/{$item['uuid']}", ['revision' => 1, 'payload' => self::envelope(), 'key_version' => 2])->assertOk();
        $this->api('PATCH', "/categories/{$cat['uuid']}", ['name' => self::envelope(), 'key_version' => 2])->assertOk();

        $this->api('POST', '/vault-keys/2/activate')->assertOk()->assertJson(['active_version' => 2]);

        $this->assertSame(2, VaultKey::current()->version);
        $this->assertSame(0, VaultKeyGrant::where('key_version', 1)->count());
        $this->assertSame('sealed', VaultKeyGrant::where('user_id', $other->id)->value('type'));
        // Écrire avec l'ancienne version est désormais refusé
        $this->api('POST', '/vault-items', $this->newItem(['key_version' => 1]))->assertStatus(409);
    }

    public function test_export_requires_reauthentication_and_contains_only_ciphertext(): void
    {
        $item = $this->newItem();
        $this->api('POST', '/vault-items', $item)->assertCreated();

        $this->api('POST', '/exports/encrypted')->assertForbidden();
        $this->reauth();
        $export = $this->api('POST', '/exports/encrypted')->assertOk()
            ->assertJsonPath('format', 'koffra-vault-export')
            ->assertJsonPath('items.0.payload', $item['payload']);

        $this->assertSame(1, ActivityLog::where('event_type', 'export.created')->count());
        $this->assertArrayNotHasKey('kdf_params', $export->json());
    }

    public function test_activity_log_never_contains_ciphertext(): void
    {
        $item = $this->newItem();
        $this->api('POST', '/vault-items', $item)->assertCreated();
        $this->api('PATCH', "/vault-items/{$item['uuid']}", ['revision' => 1, 'payload' => self::envelope(), 'key_version' => 1])->assertOk();

        $logs = json_encode($this->api('GET', '/activity')->assertOk()->json('data'));
        $this->assertStringContainsString('item.created', $logs);
        $this->assertStringNotContainsString($item['payload']['c'], $logs);
        $this->assertStringNotContainsString($item['payload']['n'], $logs);
    }
}
