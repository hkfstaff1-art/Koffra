<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Coffre partagé (décision validée : un seul coffre pour tous les admins).
| Le serveur ne stocke que ciphertext + nonce + versions : jamais de contenu en clair.
*/
return new class extends Migration
{
    public function up(): void
    {
        // Versions de la clé du coffre (rotation).
        Schema::create('vault_keys', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('version')->unique();
            $table->string('status', 20)->default('active'); // active | rotating | retired
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Enveloppes de la clé du coffre pour chaque admin.
        Schema::create('vault_key_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('key_version');
            $table->foreign('key_version')->references('version')->on('vault_keys')->cascadeOnDelete();
            $table->string('type', 12); // confirmed (AEAD userKey) | sealed (sealed box, invitation)
            $table->text('encrypted_key');
            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'key_version', 'type']);
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->text('name_ciphertext');
            $table->string('name_nonce', 40);
            $table->unsignedTinyInteger('crypto_version')->default(1);
            $table->unsignedInteger('key_version');
            $table->string('icon', 40)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('vault_items', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->longText('ciphertext');
            $table->string('nonce', 40);
            $table->unsignedTinyInteger('crypto_version')->default(1);
            $table->unsignedInteger('key_version')->index();
            $table->boolean('favorite')->default(false);
            $table->timestamp('archived_at')->nullable();
            // révision : contrôle de concurrence optimiste entre admins
            $table->unsignedInteger('revision')->default(1);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes(); // corbeille
            $table->index('created_at');
            $table->index('updated_at');
        });

        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('vault_item_id')->constrained()->cascadeOnDelete();
            $table->string('storage_key', 120)->unique();
            $table->unsignedBigInteger('encrypted_size');
            $table->char('ciphertext_sha256', 64);
            $table->unsignedTinyInteger('crypto_version')->default(1);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Journal d'activité : ajout seul, aucune valeur secrète.
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event_type', 60)->index();
            $table->foreignId('device_id')->nullable()->constrained('trusted_devices')->nullOnDelete();
            $table->string('ip_truncated', 45)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('vault_items');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('vault_key_grants');
        Schema::dropIfExists('vault_keys');
    }
};
