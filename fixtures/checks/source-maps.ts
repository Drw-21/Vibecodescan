import { appSite } from '../sites.ts';
import type { CheckCase } from './types.ts';

const MAP = JSON.stringify({
  version: 3,
  file: 'index-a1b2c3d4.js',
  sources: ['../src/App.tsx', '../src/lib/supabase.ts'],
  sourcesContent: ['export default function App() {}', 'export const x = 1;'],
  mappings: 'AAAA,SAAS',
});

const json = (body: string) => ({ body, headers: { 'content-type': 'application/json' } });

export const cases: CheckCase[] = [
  {
    name: 'bundle points to a published .map file',
    site: appSite({
      bundles: { '/assets/index-a1b2c3d4.js': 'a();\n//# sourceMappingURL=index-a1b2c3d4.js.map' },
      routes: { '/assets/index-a1b2c3d4.js.map': json(MAP) },
    }),
    expect: 'fail',
    failSeverities: ['medium'],
    evidence: ['/assets/index-a1b2c3d4.js.map'],
  },
  {
    name: 'no comment, but <bundle>.map is published anyway',
    site: appSite({ routes: { '/assets/index-a1b2c3d4.js.map': json(MAP) } }),
    expect: 'fail',
    failSeverities: ['medium'],
  },
  {
    name: 'the source map is embedded inside the bundle',
    site: appSite({
      bundles: {
        '/assets/index-a1b2c3d4.js': `a();\n//# sourceMappingURL=data:application/json;base64,${btoa(MAP)}`,
      },
    }),
    expect: 'fail',
    failSeverities: ['medium'],
    evidence: ['/assets/index-a1b2c3d4.js'],
  },
  {
    name: 'a map published only for the 7th bundle is still found',
    site: appSite({
      bundles: Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [`/assets/chunk-${String(i)}.js`, `c${String(i)}()`]),
      ),
      routes: { '/assets/chunk-6.js.map': json(MAP) },
    }),
    expect: 'fail',
    failSeverities: ['medium'],
    evidence: ['/assets/chunk-6.js.map'],
  },
  {
    name: 'fail safe: the server is overloaded (503) for .map requests',
    site: appSite({ routes: { 'https://app.example.test/*': { status: 503, body: 'busy' } } }),
    expect: 'incomplete',
  },
  {
    name: 'no maps published',
    site: appSite(),
    expect: 'pass',
  },
  {
    name: 'false-positive trap: catch-all app returns its page for .map URLs',
    site: appSite({
      catchAll: true,
      bundles: { '/assets/index-a1b2c3d4.js': 'a();\n//# sourceMappingURL=index-a1b2c3d4.js.map' },
    }),
    expect: 'pass',
  },
  {
    name: 'the .map probes could not be made',
    site: appSite({ routes: { 'https://app.example.test/*': { refuse: true } } }),
    expect: 'incomplete',
  },
];
