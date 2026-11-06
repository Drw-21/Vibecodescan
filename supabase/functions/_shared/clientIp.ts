// The requester's IP for rate limiting. Only a keyed hash is ever stored.

import { parseIPv4, parseIPv6 } from './scanner/ip.ts';

/** First address in X-Forwarded-For (set by Supabase's edge), if it is a real IP. */
export function clientIp(req: Request): string | null {
  const first = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? '';
  return parseIPv4(first) || parseIPv6(first) ? first : null;
}

/** HMAC-SHA256 of the IP with a server secret, as 64 hex characters. */
export async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
