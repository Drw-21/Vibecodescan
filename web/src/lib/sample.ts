// The sample report on the landing page: our own example, never real scan data.

import type { FindingView } from '../components/FindingRow';

export const SAMPLE = {
  host: 'example-app.lovable.app',
  grade: 'D',
  score: 52,
  findings: [
    {
      severity: 'critical',
      title: 'Your OpenAI API key is visible to anyone',
      explanation:
        'Your app sends this private key to every visitor’s browser, where anyone can copy it and use it as you, at your cost. Treat it as stolen: create a new key, delete this one, and move the call that needs it to a server-side function.',
      evidence: 'sk-p…9xQ2 in /assets/index-4f1c2a.js',
      fixPrompt:
        'My app exposes my OpenAI API key in the frontend code. Move every OpenAI call into a Supabase Edge Function that reads the key from a secret named OPENAI_API_KEY, and change the frontend to call that function instead. Remove the key from all frontend files and environment variables that start with VITE_. After the fix, rescan to confirm.',
    },
    {
      severity: 'medium',
      title: 'No protection against injected scripts (Content-Security-Policy)',
      explanation:
        'This header tells browsers which scripts your app is allowed to run. Without it, if an attacker manages to slip a script into your page, browsers will run it and it can steal your users’ logins.',
      evidence: 'Content-Security-Policy header missing or switched off',
      fixPrompt:
        "Add a Content-Security-Policy header to every page of my app that only allows scripts from my own domain: default-src 'self'; frame-ancestors 'none'. Keep the app working, and tell me if any third-party script needs to be allowed. After the fix, rescan to confirm.",
    },
    {
      severity: 'low',
      title: 'Browsers may guess file types (X-Content-Type-Options)',
      explanation:
        'This header stops browsers from treating an uploaded file as a script just because it looks like one. Set it to “nosniff”.',
      evidence: 'X-Content-Type-Options header missing or switched off',
      fixPrompt:
        'Add the response header X-Content-Type-Options: nosniff to every page and file my app serves. After the fix, rescan to confirm.',
    },
  ] satisfies FindingView[],
};
