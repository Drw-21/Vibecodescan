// Decides whether an IP address is on the public internet.
// Used by safeFetch to stop the scanner reaching our own or anyone's private network (SSRF).
// Allow-list approach: an address is public only if it is in a known public range and in
// none of the special-purpose ranges. Anything that does not parse is NOT public (fail safe).

type Bytes = number[];

/** IPv4 ranges that are not the public internet (RFC 6890 and friends). */
const BLOCKED_V4: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
];

/** IPv6 ranges inside 2000::/3 that are still not public. */
const BLOCKED_V6: readonly (readonly [string, number])[] = [
  ['2001::', 23], // IETF protocol assignments, incl. Teredo 2001::/32
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds an IPv4 address; refuse rather than decode)
  ['3fff::', 20], // documentation (RFC 9637)
];

export function isPublicAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isPublicV4(v4);
  const v6 = parseIPv6(address);
  if (v6) return isPublicV6(v6);
  return false;
}

function isPublicV4(bytes: Bytes): boolean {
  return !BLOCKED_V4.some(([base, bits]) => inRange(bytes, parseIPv4Strict(base), bits));
}

function isPublicV6(bytes: Bytes): boolean {
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judge the embedded IPv4.
  if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPublicV4(bytes.slice(12));
  }
  const nat64 = parseIPv6Strict('64:ff9b::');
  if (inRange(bytes, nat64, 96)) return isPublicV4(bytes.slice(12));

  // Only global unicast (2000::/3) can be public. This rules out ::, ::1, ::/96
  // (IPv4-compatible), fc00::/7 (unique local), fe80::/10 (link-local), fec0::/10, ff00::/8.
  const first = bytes[0] ?? 0;
  if ((first & 0xe0) !== 0x20) return false;
  return !BLOCKED_V6.some(([base, bits]) => inRange(bytes, parseIPv6Strict(base), bits));
}

function inRange(address: Bytes, base: Bytes, prefixBits: number): boolean {
  if (address.length !== base.length) return false;
  let bits = prefixBits;
  for (let i = 0; i < address.length && bits > 0; i++) {
    const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if (((address[i] ?? 0) & mask) !== ((base[i] ?? 0) & mask)) return false;
    bits -= 8;
  }
  return true;
}

/** Strict dotted-quad only ("1.2.3.4"). Other spellings are normalised earlier by `new URL`. */
export function parseIPv4(text: string): Bytes | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const bytes: Bytes = [];
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes;
}

/** Full IPv6 text form, including "::" and a trailing dotted IPv4. No brackets, no zone id. */
export function parseIPv6(text: string): Bytes | null {
  if (!/^[0-9a-fA-F:.]+$/.test(text) || !text.includes(':')) return null;
  const halves = text.split('::');
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    const pieces = part.split(':');
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i] ?? '';
      if (i === pieces.length - 1 && piece.includes('.')) {
        const v4 = parseIPv4(piece);
        if (!v4) return null;
        groups.push(((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0));
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
        groups.push(parseInt(piece, 16));
      }
    }
    return groups;
  };

  const head = toGroups(halves[0] ?? '');
  const tail = halves.length === 2 ? toGroups(halves[1] ?? '') : [];
  if (!head || !tail) return null;

  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  return groups.flatMap((g) => [g >> 8, g & 0xff]);
}

function parseIPv4Strict(text: string): Bytes {
  const bytes = parseIPv4(text);
  if (!bytes) throw new Error(`bad IPv4 constant ${text}`);
  return bytes;
}

function parseIPv6Strict(text: string): Bytes {
  const bytes = parseIPv6(text);
  if (!bytes) throw new Error(`bad IPv6 constant ${text}`);
  return bytes;
}
