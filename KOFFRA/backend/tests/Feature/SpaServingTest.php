<?php

namespace Tests\Feature;

use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/** L'application React est servie par Laravel, sur le même domaine que l'API, avec sa propre CSP. */
class SpaServingTest extends TestCase
{
    private string $spa;

    private ?string $backup = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->spa = public_path('spa.html');
        $this->backup = File::exists($this->spa) ? File::get($this->spa) : null;
        File::put($this->spa, '<!doctype html><title>KOFFRA test</title><div id="root"></div>');
    }

    protected function tearDown(): void
    {
        $this->backup === null ? File::delete($this->spa) : File::put($this->spa, $this->backup);
        parent::tearDown();
    }

    public function test_client_side_routes_return_the_app_with_a_strict_csp(): void
    {
        foreach (['/', '/connexion', '/coffre/123', '/installation'] as $path) {
            $response = $this->get($path)->assertOk()->assertSee('KOFFRA test', false);
            $response->assertHeader('Content-Security-Policy', SpaController::CSP);
            // Régression : avec « no-referrer », Sanctum ne reconnaît pas les GET de l'application
            // (ni Referer ni Origin) et la session est perdue à chaque rechargement.
            $response->assertHeader('Referrer-Policy', 'same-origin');
            $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        }

        $csp = SpaController::CSP;
        $this->assertStringNotContainsString("'unsafe-eval'", $csp);
        $this->assertStringContainsString("script-src 'self' 'wasm-unsafe-eval';", $csp);
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
    }

    public function test_api_paths_are_never_answered_by_the_app(): void
    {
        $this->getJson('/api/v1/health')->assertOk()->assertJson(['service' => 'koffra-api']);
        $this->getJson('/api/v1/inexistant')->assertNotFound();
        $this->get('/api')->assertNotFound();
        $this->get('/up')->assertOk();
    }

    public function test_missing_build_returns_503(): void
    {
        File::delete($this->spa);
        $this->get('/')->assertStatus(503);
    }
}
