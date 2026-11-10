import { and, eq } from 'drizzle-orm';
import { withSignedLink } from '../context.js';
import { db, schema as s } from '../db.js';

const page = (title: string, content: string) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Roomie</title></head><body style="margin:0;background:#f6f5fb;color:#20202a;font-family:Arial,sans-serif"><main style="max-width:520px;margin:10vh auto;padding:20px"><section style="background:#fff;border:1px solid #dedce8;border-radius:16px;padding:28px"><div style="font-weight:700;color:#4338ca">Roomie</div><h1 style="font-size:24px">${title}</h1>${content}</section></main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export const GET = withSignedLink(async ({ token }) => page('Stop these emails?', `<p>This turns off this type of event email for this household. Other Roomie notifications stay unchanged.</p><form method="post" action="/api/email/unsubscribe?t=${encodeURIComponent(token)}"><button style="border:0;border-radius:9px;background:#4338ca;color:#fff;font-weight:700;padding:12px 18px;cursor:pointer">Unsubscribe</button></form>`));

export const POST = withSignedLink(async ({ claims }) => {
  await db.delete(s.notificationSetting).where(and(
    eq(s.notificationSetting.userId, claims.userId), eq(s.notificationSetting.householdId, claims.householdId),
    eq(s.notificationSetting.channel, claims.channel), eq(s.notificationSetting.kind, claims.kind),
  ));
  return page('You’re unsubscribed', '<p>That email preference is now off. You can turn it back on from Roomie settings at any time.</p>');
});
