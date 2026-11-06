// FAKE secrets for tests, assembled at runtime from a deterministic pattern.
// Nothing secret-shaped is ever written in the repository, so secret scanners
// (Gitleaks, GitHub push protection) stay quiet, and none of these work anywhere.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** n characters of mixed upper case, lower case and digits. */
export function mixed(n: number, seed = 0): string {
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[(i * 7 + seed) % ALPHABET.length] ?? 'x';
  return out;
}

const upperDigits = (n: number, seed = 0): string =>
  mixed(n * 3, seed)
    .replace(/[a-z]/g, '')
    .slice(0, n);

function base64url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function jwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  return [header, base64url(JSON.stringify(payload)), mixed(43, 5)].join('.');
}

export const SUPABASE_REF = 'abcdefghijklmnopqrst';
export const supabaseUrl = (): string => `https://${SUPABASE_REF}.supabase.co`;

export const fake = {
  openai: (): string => ['sk', 'proj', mixed(48, 1)].join('-'),
  anthropic: (): string => ['sk', 'ant', 'api03', mixed(93, 2)].join('-'),
  anthropicAdmin: (): string => ['sk', 'ant', 'admin01', mixed(93, 16)].join('-'),
  stripeLive: (): string => ['sk', 'live', mixed(99, 3)].join('_'),
  stripeTest: (): string => ['sk', 'test', mixed(99, 4)].join('_'),
  stripeRestricted: (): string => ['rk', 'live', mixed(99, 15)].join('_'),
  stripePublishable: (): string => ['pk', 'live', mixed(99, 6)].join('_'),
  supabaseServiceRole: (): string =>
    jwt({ iss: 'supabase', ref: SUPABASE_REF, role: 'service_role', iat: 1, exp: 2 }),
  supabaseAnon: (): string =>
    jwt({ iss: 'supabase', ref: SUPABASE_REF, role: 'anon', iat: 1, exp: 2 }),
  supabaseSecret: (): string => ['sb', 'secret', mixed(32, 7)].join('_'),
  supabasePublishable: (): string => ['sb', 'publishable', mixed(32, 8)].join('_'),
  awsKeyId: (): string => ['AK', 'IA', upperDigits(16, 9)].join(''),
  awsSecret: (): string => mixed(40, 10),
  resend: (): string => ['re', mixed(8, 11), mixed(24, 12)].join('_'),
  github: (): string => ['gh', 'p_', mixed(36, 13)].join(''),
  githubServer: (): string => ['gh', 's_', mixed(36, 17)].join(''),
  githubFineGrained: (): string => ['github', 'pat', mixed(22, 18), mixed(59, 19)].join('_'),
  firebaseApiKey: (): string => ['AI', 'za', 'Sy', mixed(33, 14)].join(''),
};
