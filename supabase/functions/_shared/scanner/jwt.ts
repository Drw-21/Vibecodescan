// Reads the middle part of a JWT. The signature is NOT checked: we only need to know
// which role a key in someone's bundle claims to have (anon vs service_role).

export function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (part === undefined) return null;
  try {
    const padded = part
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(part.length / 4) * 4, '=');
    const value: unknown = JSON.parse(atob(padded));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Candidate JWTs inside quotes in some text. */
export const JWT_IN_QUOTES =
  /(?<=["'`])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
