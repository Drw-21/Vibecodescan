// verify-site ("Check now"): a signed-in user proves they own one of their sites, with a DNS
// TXT record or a file on the site. Only the site's owner can check it, at most once per
// cooldown, and an expired code is replaced by a new one.

import { VERIFY } from '../_shared/config.ts';
import { corsHeaders, json, problem } from '../_shared/http.ts';
import type { Logger } from '../_shared/log.ts';
import type { ScanStore } from '../_shared/store.ts';
import { VerifySiteBody, readJson } from '../_shared/validate.ts';
import type { SiteToVerify, VerifyResult } from '../_shared/verify.ts';

export interface VerifySiteDeps {
  store: ScanStore;
  userIdFromRequest: (req: Request) => Promise<string | null>;
  verifyOwnership: (site: SiteToVerify) => Promise<VerifyResult>;
  allowedOrigin: string;
  log: Logger;
  now?: () => Date;
}

export function verifySiteHandler(deps: VerifySiteDeps): (req: Request) => Promise<Response> {
  const origin = deps.allowedOrigin;
  const now = deps.now ?? (() => new Date());
  const handle = async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (req.method !== 'POST') return problem(405, 'method_not_allowed', 'Use POST.', origin);
    const requestOrigin = req.headers.get('origin');
    if (requestOrigin !== null && requestOrigin !== origin) {
      return problem(403, 'forbidden_origin', 'Please use our website.', origin);
    }

    const userId = await deps.userIdFromRequest(req);
    if (userId === null) return problem(401, 'sign_in_required', 'Please sign in first.', origin);

    let siteId: string;
    try {
      const parsed = VerifySiteBody.safeParse(await readJson(req));
      if (!parsed.success)
        return problem(400, 'invalid_body', 'Please choose one of your apps.', origin);
      siteId = parsed.data.siteId;
    } catch {
      return problem(400, 'invalid_body', 'Please choose one of your apps.', origin);
    }

    const site = await deps.store.siteForOwner(siteId, userId);
    if (!site)
      return problem(404, 'site_not_found', 'We could not find that app in your account.', origin);

    if (!site.verifiedAt && new Date(site.verifyTokenExpiresAt) <= now()) {
      await deps.store.rotateSiteToken(site.id);
      return problem(
        409,
        'token_expired',
        'Your verification code had expired, so we made a new one. Update your DNS record or file with the new code, then check again.',
        origin,
      );
    }

    const allowed = await deps.store.beginVerifyAttempt(site.id, userId, VERIFY.cooldownSeconds);
    if (!allowed) {
      return problem(429, 'too_soon', 'Please wait a few seconds before checking again.', origin, {
        'retry-after': String(VERIFY.cooldownSeconds),
      });
    }

    const result = await deps.verifyOwnership({
      url: site.url,
      host: site.host,
      token: site.verifyToken,
    });
    // Saved only if the address and code are still the ones just checked (the owner may have
    // changed the address while the check ran).
    const saved =
      result.verified &&
      (await deps.store.setSiteVerified(site.id, true, {
        host: site.host,
        token: site.verifyToken,
      }));
    if (result.verified && !saved) {
      return problem(
        409,
        'site_changed',
        'This app’s address changed while we checked. Please check again.',
        origin,
      );
    }
    if (result.verified) {
      deps.log.info('site verified', { method: result.method });
      return json(200, { verified: true, method: result.method }, origin);
    }
    return json(
      200,
      {
        verified: false,
        message:
          'We could not find your code yet. DNS changes can take up to an hour to show up; a file must be at the exact address shown. Check again in a few minutes.',
      },
      origin,
    );
  };

  return async (req) => {
    try {
      return await handle(req);
    } catch (error) {
      deps.log.error('verify-site failed', {
        error: error instanceof Error ? error.name : typeof error,
      });
      return problem(
        500,
        'internal',
        'Something went wrong on our side. Please try again.',
        origin,
      );
    }
  };
}
