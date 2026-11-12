// The contract between the runner and every check (spec: "Scan engine").
// The engine is a pure library: nothing here knows about the database, billing or UI.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingStatus = 'fail' | 'pass' | 'incomplete';

export interface Finding {
  checkId: string;
  status: FindingStatus;
  severity: Severity;
  /** Short, plain English. */
  title: string;
  /** Why it matters, no jargon. */
  explanation: string;
  /** Never a full secret: first 4 and last 4 characters at most. */
  evidenceRedacted?: string;
  /** Which fix-prompt template to use. */
  fixKey: string;
}

export type Platform = 'lovable' | 'bolt' | 'replit' | 'v0' | 'vercel' | 'netlify' | 'unknown';

export interface Backend {
  supabase?: { url: string; anonKey: string };
  firebase?: { projectId: string; databaseUrl?: string };
}

export interface Bundle {
  url: string;
  body: string;
}

export interface ScanContext {
  /** The page actually loaded (after redirects). */
  url: URL;
  html: string;
  headers: Headers;
  /** Same-host script bundles, size-capped. */
  bundles: Bundle[];
  /**
   * False when a bundle could not be loaded or a cap was hit, so a check that found
   * nothing in the bundles must report "incomplete", not "pass" (fail safe).
   */
  bundlesComplete: boolean;
  platform: Platform;
  backend: Backend;
  verified: boolean;
  /** The only network access a check is allowed. */
  fetch: SafeFetch;
}

export interface Check {
  id: string;
  title: string;
  requiresVerification: boolean;
  timeoutMs: number;
  run(ctx: ScanContext): Promise<Finding[]>;
}

// ---------------------------------------------------------------------------
// safeFetch

export interface SafeFetchInit {
  /** Extra request headers. User-Agent cannot be overridden. */
  headers?: Record<string, string>;
  /** Lower the per-response byte cap for this request (never raise it). */
  maxBytes?: number;
  /** Aborts the request early (e.g. when a check's own time limit runs out). */
  signal?: AbortSignal;
}

export interface SafeResponse {
  /** Final URL after redirects. */
  url: string;
  status: number;
  headers: Headers;
  /** Body decoded as UTF-8, cut at the byte cap. */
  body: string;
  /** True if the body was cut at the byte cap. */
  truncated: boolean;
  /** Every URL visited before the final one, in order. */
  redirects: string[];
}

export type SafeFetch = (url: string | URL, init?: SafeFetchInit) => Promise<SafeResponse>;

export type SafeFetchErrorCode =
  | 'invalid_url'
  | 'blocked_scheme'
  | 'blocked_port'
  | 'blocked_credentials'
  | 'blocked_address'
  | 'dns_failed'
  | 'too_many_redirects'
  | 'timeout'
  | 'aborted'
  | 'network';

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;

  constructor(code: SafeFetchErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SafeFetchError';
    this.code = code;
  }
}
