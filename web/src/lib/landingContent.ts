// Everything the landing page says, in one place.
// Every button label starts with a verb (tested).

import type { IconName } from '../components/Icon';

export const PRODUCT = 'Scanner';
export const BUILDERS = ['Lovable', 'Bolt', 'Replit', 'v0', 'Cursor'];

// --- Social proof -------------------------------------------------------------------------
// Left out on purpose until there are real numbers and real customer quotes (owner's decision):
// no invented stats or testimonials on the live site.

// --- Problem: what founders struggle with today, in their own words --------------------------
export const PROBLEM = {
  eyebrow: 'Sound familiar?',
  heading: 'Checking if your app is safe shouldn’t need a security degree',
  bullets: [
    'I asked the AI if my app was secure, and it just said yes.',
    'I have no idea if my API keys are showing up in my app.',
    'Every security tool I try talks in words I don’t understand.',
  ],
};

// --- Solution: before and after, every "after" a concrete result --------------------------
export const SOLUTION = {
  eyebrow: 'With Scanner',
  heading: 'From hoping to knowing',
  pairs: [
    {
      before: 'You ask your AI builder “is my app safe?” and hope it’s right.',
      after:
        'You get a grade from A to F and a list of every problem we found, in about 30 seconds.',
    },
    {
      before: 'You search for security terms you don’t understand.',
      after:
        'Each problem comes with a ready-made prompt you paste into Lovable, Bolt or Cursor to fix it.',
    },
    {
      before: 'You find out a private key leaked when a surprise bill arrives.',
      after: 'You see which key leaked and which file it is in, before anyone else does.',
    },
  ],
};

// --- Features: only what a free scan does, tied to the decision to start one -----------------
export const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'key',
    title: 'Leaked secret keys',
    text: 'Find any private key your app shows visitors before someone runs up your bill.',
  },
  {
    icon: 'file',
    title: 'Exposed private files',
    text: 'Spot settings files and backups that anyone could download from your site.',
  },
  {
    icon: 'code',
    title: 'Published source code',
    text: 'Know whether strangers can read the code your AI builder wrote.',
  },
  {
    icon: 'shield',
    title: 'Browser protections',
    text: 'Check the five settings that stop attackers injecting scripts into your pages.',
  },
  {
    icon: 'lock',
    title: 'Secure connection',
    text: 'Make sure every visitor lands on the encrypted version of your app.',
  },
  {
    icon: 'cookie',
    title: 'Safe login cookies',
    text: 'Make sure your users’ logins can’t be stolen through weak cookie settings.',
  },
];

// --- Pricing (prices from the spec; paid plans arrive with billing) -------------------------
export interface Plan {
  name: string;
  price: string;
  period: string;
  blurb: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  available: boolean;
}
export const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    blurb: 'See where you stand in 30 seconds.',
    features: [
      'Passive scan of any app',
      'Grade from A to F',
      'Issue count by severity',
      'Titles of your top 3 issues',
    ],
    cta: 'Start a free scan',
    available: true,
  },
  {
    name: 'Monitor',
    price: '$19',
    period: '/month',
    blurb: 'Stay safe as your app changes.',
    features: [
      'Up to 3 apps',
      'Weekly automatic rescans',
      'Email alert when a new issue appears',
      'Score history',
    ],
    cta: 'Start monitoring',
    highlighted: true,
    available: false,
  },
  {
    name: 'Deep scan',
    price: '$15',
    period: 'one-off',
    blurb: 'Everything, once, for an app you own.',
    features: [
      'Deep checks of your Supabase or Firebase data',
      'Full report in plain English',
      'All fix prompts',
      'PDF export',
      'One rescan within 7 days',
    ],
    cta: 'Get a deep scan',
    available: false,
  },
];

// --- FAQ ----------------------------------------------------------------------------------
export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is it safe to scan my app?',
    a: 'Yes. The free scan only reads what any browser already downloads when it opens your app. We never log in, submit forms, or change anything.',
  },
  {
    q: 'Do I need to know anything about security?',
    a: 'No. Every issue is explained in plain English, and each one comes with a prompt you can paste into your AI builder to fix it.',
  },
  {
    q: 'Why do I have to prove I own the app for deep checks?',
    a: 'Deep checks look at your database. We only do that for apps you own, so you prove it by adding a small file or DNS record we give you.',
  },
  {
    q: 'Is this a penetration test?',
    a: 'No. Scanner is an automated check for the most common mistakes in AI-built apps. It cannot promise an app is safe.',
  },
  {
    q: 'Which builders do you support?',
    a: 'Apps built with Lovable, Bolt, Replit, v0 and Cursor, and most other web apps. Fix prompts are tailored to your builder.',
  },
  {
    q: 'What do you keep about my app?',
    a: 'Only the address and the findings. We never keep your page content, and never store a full secret or any data from your database. Free scans are deleted after 90 days.',
  },
];

// --- Final call to action -----------------------------------------------------------------
export const FINAL_CTA = {
  heading: 'Find out in 30 seconds',
  text: 'Free, read-only and in plain English. Nothing on your app is changed.',
  cta: 'Scan my app now',
};
