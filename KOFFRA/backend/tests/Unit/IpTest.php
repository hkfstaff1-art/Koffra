<?php

namespace Tests\Unit;

use App\Support\Ip;
use PHPUnit\Framework\TestCase;

class IpTest extends TestCase
{
    public function test_ipv4_is_truncated_to_24_bits(): void
    {
        $this->assertSame('137.255.159.0', Ip::truncate('137.255.159.69'));
    }

    public function test_ipv6_is_truncated_to_48_bits(): void
    {
        $this->assertSame('2a02:8429:1234::', Ip::truncate('2a02:8429:1234:5678:9abc:def0:1:2'));
    }

    public function test_invalid_or_empty_ip_gives_null(): void
    {
        $this->assertNull(Ip::truncate(null));
        $this->assertNull(Ip::truncate(''));
        $this->assertNull(Ip::truncate('pas-une-ip'));
    }

    public function test_email_is_masked(): void
    {
        $this->assertSame('c***@h***.com', Ip::maskEmail('contact@hkfstaff.com'));
        $this->assertSame('a***@l***', Ip::maskEmail('a@localhost'));
    }
}
