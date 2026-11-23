<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

/** La documentation OpenAPI doit rester synchronisée avec les routes réelles. */
class OpenApiContractTest extends TestCase
{
    public function test_openapi_file_is_valid_yaml_and_documents_every_api_route(): void
    {
        $spec = Yaml::parseFile(base_path('../docs/openapi.yaml'));

        $this->assertSame('3.1.0', $spec['openapi']);
        $this->assertSame('/api/v1', $spec['servers'][0]['url']);

        $documented = [];
        foreach ($spec['paths'] as $path => $operations) {
            foreach (array_keys($operations) as $method) {
                $documented[] = strtoupper($method).' '.$path;
            }
        }

        $missing = [];
        $checked = 0;
        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/v1/')) {
                continue;
            }
            $path = substr($route->uri(), strlen('api/v1'));
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $checked++;
                if (! in_array("$method $path", $documented, true)) {
                    $missing[] = "$method $path";
                }
            }
        }

        $this->assertGreaterThan(25, $checked, 'Routes API non chargées');
        $this->assertSame([], $missing, 'Routes non documentées dans docs/openapi.yaml');
    }
}
