// The requester's IP for rate limiting. Only a keyed hash is ever stored.
//
// The IP must come from a header the platform sets and a visitor cannot forge.
// X-Forwarded-For is NOT used: proxies append to it, so its first entry is whatever the
// visitor sent (independent review). The header name lives in config.ts and must be
// confirmed on the real deployment (docs/launch-blockers.md, item 4).

import { LIMITS } from './config.ts';
import { parseIPv4, parseIPv6 } from './scanner/ip.ts';

/** The visitor's IP from the platform's trusted header, or null if it is missing or not an IP. */
export function clientIp(req: Request, header: string = LIMITS.trustedIpHeader): string | null {
  const value = (req.headers.get(header) ?? '').trim();
  return parseIPv4(value) || parseIPv6(value) ? value : null;
}

/**
 * The part of an address that identifies one visitor: the whole IPv4 address, or the /64
 * network of an IPv6 address (one machine can rotate through many addresses inside its /64).
 */
export function rateLimitKey(ip: string): string {
  const v6 = parseIPv6(ip);
  if (!v6) return ip;
  // An IPv4 address written as IPv6 (::ffff:a.b.c.d) is that IPv4 visitor.
  if (v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff) {
    return v6.slice(12).join('.');
  }
  const groups: string[] = [];
  for (let i = 0; i < 8; i += 2) groups.push((((v6[i] ?? 0) << 8) | (v6[i + 1] ?? 0)).toString(16));
  return `${groups.join(':')}::/64`;
}

/** HMAC-SHA256 of the visitor's rate-limit key with a server secret, as 64 hex characters. */
export async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rateLimitKey(ip)));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
