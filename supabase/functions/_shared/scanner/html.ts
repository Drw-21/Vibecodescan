// Finds HTML tags by name WITHOUT running a regular expression over the whole page.
// Pages are attacker-controlled and up to 2 MB, so every regex here only ever sees one
// tag, at most MAX_TAG_LENGTH characters long (no catastrophic backtracking).

const MAX_TAG_LENGTH = 4096;
const MAX_TAGS = 2000;

/** The text of each `<name …>` tag, in order (case-insensitive name). */
export function findTags(html: string, name: string): string[] {
  const lower = html.toLowerCase();
  const needle = `<${name.toLowerCase()}`;
  const tags: string[] = [];
  let from = 0;
  while (tags.length < MAX_TAGS) {
    const start = lower.indexOf(needle, from);
    if (start === -1) break;
    const after = lower.charAt(start + needle.length);
    from = start + needle.length;
    // "<scripts" or "<linkx" are other tags.
    if (after !== '' && !/[\s/>]/.test(after)) continue;
    const end = html.indexOf('>', from);
    const stop = end === -1 ? Math.min(html.length, start + MAX_TAG_LENGTH) : end + 1;
    tags.push(html.slice(start, Math.min(stop, start + MAX_TAG_LENGTH)));
    if (end === -1) break;
    from = end + 1;
  }
  return tags;
}

/** Value of one attribute in a single tag, quoted or not. */
export function attribute(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}
