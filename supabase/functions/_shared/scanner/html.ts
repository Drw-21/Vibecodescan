// Finds HTML tags by name WITHOUT running a regular expression over the whole page.
// Pages are attacker-controlled and up to 2 MB, so every regex here only ever sees one
// tag, at most MAX_TAG_LENGTH characters long (no catastrophic backtracking).

const MAX_TAG_LENGTH = 4096;
const MAX_TAGS = 2000;

export interface TagScan {
  tags: string[];
  /** False if the page had more matching tags than we read: anything after is unseen. */
  complete: boolean;
}

/** The text of each `<name …>` tag, in order (case-insensitive name). */
export function findTags(html: string, name: string): TagScan {
  // Lower-case ASCII letters only: full Unicode lower-casing can change the length
  // (e.g. Turkish "İ" becomes two characters) and break the positions we cut from `html`.
  const lower = html.replace(/[A-Z]+/g, (s) => s.toLowerCase());
  const needle = `<${name.toLowerCase()}`;
  const tags: string[] = [];
  let from = 0;
  for (;;) {
    const start = lower.indexOf(needle, from);
    if (start === -1) break;
    if (tags.length >= MAX_TAGS) return { tags, complete: false };
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
  return { tags, complete: true };
}

/** Value of one attribute in a single tag, quoted or not. */
export function attribute(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}
