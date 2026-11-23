<?php

namespace Tests\Feature;

use Tests\TestCase;

class ApiFoundationTest extends TestCase
{
    public function test_health_endpoint_is_versioned_and_returns_json(): void
    {
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertExactJson(['status' => 'ok', 'service' => 'koffra-api', 'version' => 'v1']);
    }

    public function test_unversioned_api_path_does_not_exist(): void
    {
        $this->getJson('/api/health')->assertNotFound();
    }

    public function test_api_responses_carry_security_headers_and_are_never_cached(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'no-referrer');

        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        // HSTS seulement en HTTPS
        $response->assertHeaderMissing('Strict-Transport-Security');
    }

    public function test_hsts_is_sent_over_https(): void
    {
        $this->getJson('https://localhost/api/v1/health')
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    public function test_cors_allows_only_the_configured_frontend_origin(): void
    {
        config(['cors.allowed_origins' => ['http://localhost:5173']]);

        $this->withHeaders(['Origin' => 'http://localhost:5173'])
            ->getJson('/api/v1/health')
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');

        // Avec une origine unique, la lib CORS la renvoie systématiquement ; le navigateur
        // refuse alors toute origine différente. On vérifie que l'attaquant n'est jamais autorisé.
        $hostile = $this->withHeaders(['Origin' => 'https://attaquant.example'])->getJson('/api/v1/health');
        $this->assertNotSame('https://attaquant.example', $hostile->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotSame('*', $hostile->headers->get('Access-Control-Allow-Origin'));
    }

    public function test_unauthenticated_api_requests_get_json_401_never_a_redirect(): void
    {
        $this->get('/api/v1/me')->assertUnauthorized();
        $this->getJson('/api/v1/vault-items')->assertUnauthorized();
    }

    public function test_csrf_cookie_endpoint_is_available_for_the_spa(): void
    {
        $this->get('/sanctum/csrf-cookie')
            ->assertNoContent()
            ->assertCookie('XSRF-TOKEN');
    }
}
