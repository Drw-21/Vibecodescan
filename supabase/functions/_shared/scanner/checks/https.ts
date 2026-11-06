// https: the app is served over HTTPS (so its certificate was valid when we loaded it),
// and anyone who types http:// is sent to the secure version.

import type { Check, Finding } from '../types.ts';
import { SafeFetchError } from '../types.ts';

export const https: Check = {
  id: 'https',
  title: 'Secure connection (HTTPS)',
  requiresVerification: false,
  timeoutMs: 8_000,
  async run(ctx) {
    const result = (
      status: Finding['status'],
      title: string,
      explanation: string,
      evidence?: string,
    ): Finding[] => [
      {
        checkId: this.id,
        status,
        severity: 'high',
        title,
        explanation,
        ...(evidence ? { evidenceRedacted: evidence } : {}),
        fixKey: status === 'fail' ? 'https.redirect' : 'https',
      },
    ];

    if (ctx.url.protocol !== 'https:') {
      return result(
        'fail',
        'Your app does not use a secure connection (HTTPS)',
        'Your app loads over plain http, so anything your users type — including passwords — travels unprotected and can be read or changed by others on the same network. Turn on HTTPS with your host.',
        'page served over http://',
      );
    }

    try {
      const res = await ctx.fetch(`http://${ctx.url.host}/`, { maxBytes: 1024 });
      if (new URL(res.url).protocol === 'https:') {
        return result(
          'pass',
          'Your app uses a secure connection (HTTPS)',
          'Your app loads over HTTPS with a valid certificate, and visitors who type http:// are sent to the secure version.',
        );
      }
      return result(
        'fail',
        'Visitors who type http:// stay on an insecure connection',
        'Your app works over HTTPS, but the plain http:// address shows the app instead of sending visitors to the secure version. Anyone who follows an old link or types the address by hand is unprotected. Turn on “redirect HTTP to HTTPS” with your host.',
        'http:// does not redirect to https://',
      );
    } catch (error) {
      // Nothing answering on plain http at all means there is no insecure version.
      if (error instanceof SafeFetchError && error.code === 'network') {
        return result(
          'pass',
          'Your app uses a secure connection (HTTPS)',
          'Your app loads over HTTPS with a valid certificate, and there is no insecure http:// version.',
        );
      }
      return result(
        'incomplete',
        'We could not check the insecure http:// address',
        'Our request to the http:// version of your app did not finish, so we cannot say whether visitors are sent to the secure version. Rescan to try again.',
      );
    }
  },
};
