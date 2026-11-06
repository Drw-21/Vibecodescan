// Everything a check stores as evidence goes through here first.
// Rules (spec: "Data rules"): never a full secret — first 4 and last 4 characters only —
// and nothing that would trip the database's "looks like a whole secret" backstop.

const LONG_RUN = /[A-Za-z0-9+/=]{24,}/g;

/** "sk_live_…" -> "sk_l…x9Q2". Short values are hidden completely. */
export function redactSecret(value: string): string {
  if (value.length < 12) return '…';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Just the path of a URL: no host, query string or fragment; long hashes shortened. */
export function safePath(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return '';
  }
  return safeEvidence(path.replace(/[A-Za-z0-9]{20,}/g, (run) => `${run.slice(0, 8)}…`));
}

/** Makes any text safe to store and show: printable, short, no secret-length runs. */
export function safeEvidence(text: string): string {
  const cleaned = text
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LONG_RUN, (run) => `${run.slice(0, 20)}…`);
  return cleaned.length > 200 ? `${cleaned.slice(0, 199)}…` : cleaned;
}
