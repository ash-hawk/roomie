import { afterEach, describe, expect, it } from 'vitest';
import { destinationHash, destinationMatches, normalizeNotificationEmail } from '../api/_lib/notification-channel.js';

describe('notification channel confirmation', () => {
  const oldSecret = process.env.NOTIFICATION_HASH_SECRET;
  afterEach(() => { if (oldSecret === undefined) delete process.env.NOTIFICATION_HASH_SECRET; else process.env.NOTIFICATION_HASH_SECRET = oldSecret; });

  it('normalizes email addresses before hashing', () => {
    expect(normalizeNotificationEmail('  Roommate@Example.COM ')).toEqual({ destination: 'Roommate@Example.COM', normalized: 'roommate@example.com' });
  });

  it('uses a secret HMAC rather than the plain address hash', () => {
    process.env.NOTIFICATION_HASH_SECRET = 'first-server-secret-that-is-at-least-32-characters';
    const first = destinationHash('a@example.com');
    process.env.NOTIFICATION_HASH_SECRET = 'second-server-secret-that-is-at-least-32-characters';
    expect(destinationHash('a@example.com')).not.toEqual(first);
  });

  it('request link for A, change destination to B, click A link: B stays unverified', () => {
    process.env.NOTIFICATION_HASH_SECRET = 'test-server-secret-that-is-at-least-32-characters';
    const linkDestinationHash = destinationHash('a@example.com');
    const currentDestination = 'b@example.com';
    let verifiedAt: string | null = null;
    if (destinationMatches(linkDestinationHash, currentDestination)) verifiedAt = new Date().toISOString();
    expect(verifiedAt).toBeNull();
  });
});
