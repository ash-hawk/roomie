import { afterEach, describe, expect, it } from 'vitest';
import { createEmailLinkToken, verifyEmailLinkToken } from '../api/_lib/email-links.js';
import { renderEventEmail, sendEventEmail, type DeliveryRow } from '../api/_lib/event-email.js';
import { eventIcs, pickEventRecipients, type EmailCandidate } from '../shared/event-email.js';

const candidates: EmailCandidate[] = [
  { userId: 1, email: 'creator@example.com', current: true, channelVerified: true, enabledKinds: ['event_hosting', 'event_other', 'approval_request'] },
  { userId: 2, email: 'approver@example.com', current: true, channelVerified: true, enabledKinds: ['approval_request'] },
  { userId: 3, email: 'host@example.com', current: true, channelVerified: true, enabledKinds: ['event_hosting'] },
  { userId: 4, email: 'unverified@example.com', current: true, channelVerified: false, enabledKinds: ['event_hosting'] },
  { userId: 5, email: 'former@example.com', current: false, channelVerified: true, enabledKinds: ['event_hosting'] },
];

const deliveryRow = (): DeliveryRow => ({
  email_id: '77', user_id: '2', household_id: '3', kind: 'event_other', attempts: 0,
  email: 'roommate@example.com', current: true, verified: true, setting_enabled: true,
  event_id: '42', event_name: '<script>alert(1)</script>', event_date: '2027-01-02T01:00:00.000Z', end_date: null,
  location: 'Home <kitchen>', description: 'Bring & share', category: 'meeting', timezone: 'America/Denver',
  creator_user_id: '1', creator_name: 'Sam <Admin>',
});

describe('event email recipients', () => {
  it('uses approval settings for tagged roommates and excludes the creator and ineligible members', () => {
    expect(pickEventRecipients({ createdByUserId: 1, category: 'hosting', notifyRoommates: true, taggedUserIds: [2] }, candidates)).toEqual([
      { userId: 2, email: 'approver@example.com', kind: 'approval_request' },
      { userId: 3, email: 'host@example.com', kind: 'event_hosting' },
    ]);
  });

  it('queues nobody when the event checkbox is off', () => {
    expect(pickEventRecipients({ createdByUserId: 1, category: 'hosting', notifyRoommates: false, taggedUserIds: [2] }, candidates)).toEqual([]);
  });
});

describe('event calendar attachment', () => {
  it('contains UTC dates, escaped fields, and the event deep link', () => {
    const value = eventIcs({ eventId: 42, eventName: 'Dinner, then games', eventDate: '2027-01-02T01:00:00.000Z', endDate: null, location: 'Home; kitchen', description: 'Bring snacks\nand cards' }, 'https://roomie.example');
    expect(value).toContain('DTSTART:20270102T010000Z');
    expect(value).toContain('DTEND:20270102T020000Z');
    expect(value).toContain('SUMMARY:Dinner\\, then games');
    expect(value).toContain('LOCATION:Home\\; kitchen');
    expect(value).toContain('DESCRIPTION:Bring snacks\\nand cards');
    expect(value).toContain('URL:https://roomie.example/#/calendar/42');
  });
});

describe('event email template', () => {
  it('escapes event and roommate-written text in HTML', () => {
    process.env.APP_ORIGIN = 'https://roomie.example';
    const rendered = renderEventEmail(deliveryRow(), 'Hello <roommates> & welcome', 'https://roomie.example/unsubscribe');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).toContain('Hello &lt;roommates&gt; &amp; welcome');
    expect(rendered.html).toContain('Home &lt;kitchen&gt;');
  });

  it('sends a Brevo request with an idempotency key, unsubscribe link, and ICS attachment', async () => {
    const oldFetch = globalThis.fetch;
    const old = { key: process.env.BREVO_API_KEY, from: process.env.EMAIL_FROM, origin: process.env.APP_ORIGIN, secret: process.env.EMAIL_LINK_SECRET, base: process.env.BREVO_BASE_URL };
    process.env.BREVO_API_KEY = 'xkeysib-test'; process.env.EMAIL_FROM = 'Roomie <events@roomie.example>'; process.env.APP_ORIGIN = 'https://roomie.example';
    process.env.EMAIL_LINK_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters'; process.env.BREVO_BASE_URL = 'https://brevo.test';
    let request: Request | undefined;
    globalThis.fetch = async (input, init) => { request = new Request(input, init); return new Response(JSON.stringify({ messageId: 'email_123' }), { status: 201 }); };
    try {
      await expect(sendEventEmail(deliveryRow(), null)).resolves.toBe('email_123');
      expect(request?.url).toBe('https://brevo.test/v3/smtp/email');
      expect(request?.headers.get('api-key')).toBe('xkeysib-test');
      const body = JSON.parse(await request!.text());
      expect(body.sender).toEqual({ name: 'Roomie', email: 'events@roomie.example' });
      expect(body.to).toEqual([{ email: 'roommate@example.com' }]);
      expect(body.headers.IdempotencyKey).toBe('event-77');
      expect(body.textContent).toMatch(/https:\/\/roomie\.example\/api\/email\/unsubscribe\?t=/);
      expect(Buffer.from(body.attachment[0].content, 'base64').toString()).toContain('BEGIN:VCALENDAR');
    } finally {
      globalThis.fetch = oldFetch;
      for (const [name, value] of Object.entries({ BREVO_API_KEY: old.key, EMAIL_FROM: old.from, APP_ORIGIN: old.origin, EMAIL_LINK_SECRET: old.secret, BREVO_BASE_URL: old.base })) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  });
});

describe('unsubscribe link tokens', () => {
  const previous = process.env.EMAIL_LINK_SECRET;
  afterEach(() => { if (previous === undefined) delete process.env.EMAIL_LINK_SECRET; else process.env.EMAIL_LINK_SECRET = previous; });

  it('contains only ids and notification kind and rejects tampering', async () => {
    process.env.EMAIL_LINK_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters';
    const token = await createEmailLinkToken({ userId: 8, householdId: 13, channel: 'email', kind: 'event_other' });
    expect(token).not.toContain('example.com');
    await expect(verifyEmailLinkToken(token)).resolves.toEqual({ userId: 8, householdId: 13, channel: 'email', kind: 'event_other' });
    const parts = token.split('.'); parts[1] = `${parts[1]![0] === 'a' ? 'b' : 'a'}${parts[1]!.slice(1)}`;
    await expect(verifyEmailLinkToken(parts.join('.'))).rejects.toThrow('invalid or has expired');
  });
});
