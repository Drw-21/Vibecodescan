import { fake, supabaseUrl } from '../secrets.ts';
import { appSite } from '../sites.ts';
import type { CheckCase } from './types.ts';

const bundle = (code: string) => appSite({ bundles: { '/assets/index-a1b2c3d4.js': code } });

function leaking(name: string, key: string, severity: 'critical' | 'high'): CheckCase {
  return {
    name,
    site: bundle(`const client=new Client({apiKey:"${key}"});export{client};`),
    expect: 'fail',
    failSeverities: [severity],
    evidence: [`${key.slice(0, 4)}…${key.slice(-4)}`, '/assets/index-a1b2c3d4.js'],
    mustNotLeak: [key],
  };
}

const awsId = fake.awsKeyId();
const awsSecret = fake.awsSecret();
const inlineKey = fake.openai();

export const cases: CheckCase[] = [
  leaking('OpenAI key in a bundle', fake.openai(), 'critical'),
  leaking('Anthropic key in a bundle', fake.anthropic(), 'critical'),
  leaking('Stripe live secret key in a bundle', fake.stripeLive(), 'critical'),
  leaking('Stripe test secret key in a bundle', fake.stripeTest(), 'high'),
  leaking('Supabase service_role key in a bundle', fake.supabaseServiceRole(), 'critical'),
  leaking('Supabase secret key in a bundle', fake.supabaseSecret(), 'critical'),
  leaking('Resend key in a bundle', fake.resend(), 'critical'),
  leaking('GitHub token in a bundle', fake.github(), 'critical'),
  {
    name: 'AWS access key ID and secret together',
    site: bundle(
      `const s3=new S3({credentials:{accessKeyId:"${awsId}",secretAccessKey:"${awsSecret}"}});`,
    ),
    expect: 'fail',
    failSeverities: ['critical', 'critical'],
    mustNotLeak: [awsId, awsSecret],
  },
  {
    name: 'AWS access key ID alone',
    site: bundle(`const id="${awsId}";`),
    expect: 'fail',
    failSeverities: ['high'],
    mustNotLeak: [awsId],
  },
  {
    name: 'secret in an inline script on the page',
    site: appSite({ head: `<script>window.KEY="${inlineKey}"</script>` }),
    expect: 'fail',
    failSeverities: ['critical'],
    mustNotLeak: [inlineKey],
  },
  {
    name: 'the same key twice is reported once',
    site: bundle(`a("${inlineKey}");b("${inlineKey}");`),
    expect: 'fail',
    failSeverities: ['critical'],
  },
  {
    name: 'no keys at all',
    site: bundle('export const add=(a,b)=>a+b;'),
    expect: 'pass',
  },
  {
    name: 'only public-by-design keys (Supabase anon/publishable, Stripe pk_, Firebase apiKey)',
    site: bundle(
      `const supabase=createClient("${supabaseUrl()}","${fake.supabaseAnon()}");` +
        `const sb2="${fake.supabasePublishable()}";` +
        `const stripe=Stripe("${fake.stripePublishable()}");` +
        `const fb={apiKey:"${fake.firebaseApiKey()}",projectId:"my-app-123"};`,
    ),
    expect: 'pass',
  },
  {
    name: 'look-alikes: CSS class names and identifiers starting with sk-',
    site: bundle(
      'const c="sk-skeleton-loader-container-wrapper-large-variant";' +
        'const d="sk-ant-design-theme-provider-root-element-wrapper";' +
        '// sk-proj-this-is-only-a-comment-not-a-string-0123456789',
    ),
    expect: 'pass',
  },
  {
    name: 'a bundle failed to load and nothing was found',
    site: appSite({
      bundles: { '/assets/index-a1b2c3d4.js': 'ok()' },
      routes: { '/assets/index-a1b2c3d4.js': { status: 500, body: 'error' } },
    }),
    expect: 'incomplete',
  },
];
