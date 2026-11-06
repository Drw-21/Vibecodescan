import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('seed.sql', () => {
  it('uses only reserved example domains (never a real site)', async () => {
    const sql = await readFile(
      join(import.meta.dirname, '..', '..', 'supabase', 'seed.sql'),
      'utf8',
    );
    const hosts = [...sql.matchAll(/https?:\/\/([^/'\s]+)/g)].map((m) => m[1]);
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) expect(host).toMatch(/\.example\.test$/);
  });
});
