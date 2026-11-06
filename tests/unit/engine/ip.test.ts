import { describe, expect, it } from 'vitest';
import { isPublicAddress } from '../../../supabase/functions/_shared/scanner/ip.ts';

describe('isPublicAddress', () => {
  it.each([
    // IPv4 private, loopback, link-local (cloud metadata), and other non-public ranges
    '169.254.169.254',
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '0.0.0.0',
    '100.64.0.1', // carrier-grade NAT
    '192.0.0.1',
    '192.0.2.1', // documentation
    '198.18.0.1', // benchmarking
    '224.0.0.1', // multicast
    '255.255.255.255',
    '240.0.0.1',
    // IPv6
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1', // unique local
    'fe80::1', // link-local
    'fec0::1', // site-local (deprecated)
    'ff02::1', // multicast
    '2001:db8::1', // documentation
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:a9fe:a9fe', // IPv4-mapped 169.254.169.254
    '::127.0.0.1', // IPv4-compatible (deprecated)
    '64:ff9b::7f00:1', // NAT64 of 127.0.0.1
    '2002:7f00:1::1', // 6to4 of 127.0.0.1
    '2001::1', // Teredo
    'fd00:ec2::254', // AWS IPv6 metadata
  ])('blocks %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['93.184.216.34', '8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])(
    'allows public address %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it.each(['', 'localhost', 'example.com', '1.2.3', '1.2.3.256', '::g', '1::2::3', '[::1]'])(
    'treats unparseable input %j as not public (fail safe)',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(false);
    },
  );
});
