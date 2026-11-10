import { timingSafeEqual } from 'node:crypto';
import { requireUser, type CurrentUser } from './auth.js';
import { db } from './db.js';
import { requireActiveMember } from './household.js';
import { HttpError, id, route, segments } from './http.js';
import { verifyEmailLinkToken, type EmailLinkClaims } from './email-links.js';

export type HouseholdCtx = { user: CurrentUser; householdId: number; role: string; req: Request };

/**
 * Wrapper for every route under /api/households/:id/... . It authenticates, reads the
 * household id from the URL (never from the body), and proves the caller is an active
 * member before the route's own code runs.
 */
export function withHousehold(fn: (ctx: HouseholdCtx) => Promise<Response>) {
  return route(async (req) => {
    const user = await requireUser(req);
    const seg = segments(req);
    if (seg[0] !== 'households' || seg[1] === undefined) throw new HttpError(400, 'Missing household');
    const householdId = id(seg[1], 'household id');
    const member = await requireActiveMember(db, user.userId, householdId);
    return fn({ user, householdId, role: member.role, req });
  });
}

/** Wrapper for routes that need a signed-in user but no household. */
export function withUser(fn: (user: CurrentUser, req: Request) => Promise<Response>) {
  return route(async (req) => fn(await requireUser(req), req));
}

/** Public email actions authenticate with a short, signed capability token rather than a session cookie. */
export function withSignedLink(fn: (ctx: { claims: EmailLinkClaims; token: string; req: Request }) => Promise<Response>) {
  return route(async (req) => {
    const token = new URL(req.url).searchParams.get('t') ?? '';
    if (!token) throw new HttpError(400, 'Missing email link');
    return fn({ claims: await verifyEmailLinkToken(token), token, req });
  });
}

/** Public channel-confirmation pages authenticate with a random, hashed, single-use token. */
export function withConfirmationLink(fn: (ctx: { token: string; req: Request }) => Promise<Response>) {
  return route(async (req) => {
    const token = new URL(req.url).searchParams.get('t') ?? '';
    if (!token) throw new HttpError(400, 'Missing confirmation link');
    return fn({ token, req });
  });
}

/**
 * Wrapper for scheduled jobs (Vercel Cron). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * Fails closed: with no CRON_SECRET configured the endpoint is disabled, never open.
 */
export function withCron(fn: (req: Request) => Promise<Response>) {
  return route(async (req) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 16) throw new HttpError(503, 'Scheduled jobs are not configured');
    const got = Buffer.from(req.headers.get('authorization') ?? ''), want = Buffer.from(`Bearer ${secret}`);
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'Not allowed');
    return fn(req);
  });
}
