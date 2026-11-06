// Public configuration only (spec: "the browser only ever holds the public Supabase key").
// Every value here ends up in the JavaScript sent to visitors. Each one is read by name, so a
// wrongly named VITE_ variable can never slip into the bundle.

export interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  turnstileSiteKey: string;
}

export function readEnv(): PublicEnv {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '',
  };
}
