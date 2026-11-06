// Public configuration only (spec: "the browser only ever holds the public Supabase key").
// Every value here ends up in the JavaScript sent to visitors.

export interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  turnstileSiteKey: string;
}

export function readEnv(source: Record<string, string | undefined> = import.meta.env): PublicEnv {
  return {
    supabaseUrl: source['VITE_SUPABASE_URL'] ?? '',
    supabaseAnonKey: source['VITE_SUPABASE_ANON_KEY'] ?? '',
    turnstileSiteKey: source['VITE_TURNSTILE_SITE_KEY'] ?? '',
  };
}
