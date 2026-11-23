<?php

namespace Tests\Feature;

use App\Providers\AppServiceProvider;
use Tests\TestCase;

/** Le garde-fou bloque une configuration dangereuse en production, sans gêner la ligne de commande. */
class ProductionGuardTest extends TestCase
{
    private function bootProvider(bool $console): void
    {
        $this->app['env'] = 'production';
        $this->app->instance('runningInConsole', $console);
        $app = \Mockery::mock($this->app)->makePartial();
        $app->shouldReceive('runningInConsole')->andReturn($console);
        $app->shouldReceive('isProduction')->andReturn(true);
        (new AppServiceProvider($app))->boot();
    }

    public function test_web_request_refuses_log_mailer_in_production(): void
    {
        config(['mail.default' => 'log', 'app.debug' => false, 'session.secure' => true]);
        $this->expectExceptionMessage('MAIL_MAILER=log/array interdit en production');
        $this->bootProvider(console: false);
    }

    public function test_web_request_refuses_debug_and_insecure_cookie_in_production(): void
    {
        config(['mail.default' => 'smtp', 'app.debug' => true, 'session.secure' => true]);
        $this->expectExceptionMessage('APP_DEBUG doit être false');
        $this->bootProvider(console: false);
    }

    public function test_console_commands_are_not_blocked_during_build(): void
    {
        config(['mail.default' => 'log', 'app.debug' => true, 'session.secure' => false]);
        $this->bootProvider(console: true);
        $this->assertTrue(true);
    }

    public function test_safe_production_configuration_boots(): void
    {
        config(['mail.default' => 'smtp', 'app.debug' => false, 'session.secure' => true]);
        $this->bootProvider(console: false);
        $this->assertTrue(true);
    }
}
