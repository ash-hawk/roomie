import { describe, expect, it } from 'vitest';
import { HttpError } from '../api/_lib/http.js';
import { parseProfileUpdate } from '../api/_lib/profile.js';

const base = { firstName: 'Alex', lastName: 'Rivera', phoneNumber: '', profilePhoto: '', paymentMethods: [] };

describe('profile updates', () => {
  it('normalizes optional fields and picks a preferred payment method', () => {
    expect(parseProfileUpdate({ ...base, firstName: '  Alex ', profilePhoto: 'https://images.example/alex.jpg', paymentMethods: [{ app: 'venmo', username: ' @alex ', isPreferred: false }] })).toEqual({
      firstName: 'Alex', lastName: 'Rivera', phoneNumber: null, profilePhoto: 'https://images.example/alex.jpg',
      paymentMethods: [{ app: 'venmo', username: '@alex', isPreferred: true }],
    });
  });

  it.each([
    [{ ...base, profilePhoto: 'http://images.example/me.jpg' }, 'HTTPS'],
    [{ ...base, paymentMethods: [{ app: 'cashapp', username: '$alex' }] }, 'Unsupported'],
    [{ ...base, paymentMethods: [{ app: 'venmo', username: '@a' }, { app: 'venmo', username: '@b' }] }, 'only be added once'],
    [{ ...base, paymentMethods: [{ app: 'venmo', username: '@a', isPreferred: true }, { app: 'zelle', username: 'a@example.com', isPreferred: true }] }, 'only one preferred'],
  ])('rejects invalid profile data', (input, message) => {
    expect(() => parseProfileUpdate(input)).toThrowError(new RegExp(message, 'i'));
  });

  it('uses a clean 400 error for malformed input', () => {
    try { parseProfileUpdate(null); } catch (error) { expect(error).toBeInstanceOf(HttpError); expect((error as HttpError).status).toBe(400); }
  });

  it('accepts a small processed image and rejects oversized image data', () => {
    const image = `data:image/jpeg;base64,${'A'.repeat(200)}`;
    expect(parseProfileUpdate({ ...base, profilePhoto: image }).profilePhoto).toBe(image);
    expect(() => parseProfileUpdate({ ...base, profilePhoto: `data:image/jpeg;base64,${'A'.repeat(400_001)}` })).toThrow(/too large/i);
  });
});
