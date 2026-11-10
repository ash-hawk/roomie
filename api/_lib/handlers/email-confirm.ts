import { withConfirmationLink } from '../context.js';
import { confirmNotificationChannel } from '../notification-channel.js';

const page = (title: string, content: string) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Roomie</title></head><body style="margin:0;background:#f6f5fb;color:#20202a;font-family:Arial,sans-serif"><main style="max-width:520px;margin:10vh auto;padding:20px"><section style="background:#fff;border:1px solid #dedce8;border-radius:16px;padding:28px"><div style="font-weight:700;color:#4338ca">Roomie</div><h1 style="font-size:24px">${title}</h1>${content}</section></main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export const GET = withConfirmationLink(async ({ token }) => page('Confirm notification email', `<p>Confirm this address for important event notifications from your roommates.</p><form method="post" action="/api/email/confirm?t=${encodeURIComponent(token)}"><button style="border:0;border-radius:9px;background:#4338ca;color:#fff;font-weight:700;padding:12px 18px;cursor:pointer">Confirm email</button></form>`));

export const POST = withConfirmationLink(async ({ token }) => {
  await confirmNotificationChannel(token);
  return page('Email confirmed', '<p>This address can now receive the important event notifications you choose in Roomie.</p>');
});
