// Cloudflare Turnstile check for the anonymous scan form. Fails closed: any error = no.

import { z } from 'zod';
import { TURNSTILE } from './config.ts';

const VerifyResponse = z.object({ success: z.boolean() });

export function createTurnstileVerifier(options: {
  secret: string;
  fetch?: typeof fetch;
}): (token: string, ip: string | null) => Promise<boolean> {
  const send = options.fetch ?? fetch;
  return async (token, ip) => {
    const form = new URLSearchParams({ secret: options.secret, response: token });
    if (ip) form.set('remoteip', ip);
    try {
      const res = await send(TURNSTILE.verifyUrl, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(TURNSTILE.timeoutMs),
      });
      if (!res.ok) return false;
      const parsed = VerifyResponse.safeParse(await res.json());
      return parsed.success && parsed.data.success;
    } catch {
      return false;
    }
  };
}
