// JSON responses with CORS limited to our own site (spec: hardening checklist).

export function corsHeaders(allowedOrigin: string): Record<string, string> {
  return {
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

export function json(
  status: number,
  body: unknown,
  allowedOrigin: string,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...corsHeaders(allowedOrigin),
      ...extra,
    },
  });
}

/** A plain-English error the browser can show as-is. */
export function problem(
  status: number,
  code: string,
  message: string,
  allowedOrigin: string,
  extra: Record<string, string> = {},
): Response {
  return json(status, { error: code, message }, allowedOrigin, extra);
}

/** Constant-time comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
