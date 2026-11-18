import { jwtVerify, SignJWT } from 'jose';
import { HttpError } from './http.js';
import type { EmailKind } from '../../shared/event-email.js';

export type EmailLinkClaims = { userId: number; householdId: number; channel: 'email'; kind: EmailKind };

function key() {
  const secret = process.env.EMAIL_LINK_SECRET;
  if (!secret || secret.length < 32) throw new Error('EMAIL_LINK_SECRET must be at least 32 characters');
  return new TextEncoder().encode(secret);
}

export async function createEmailLinkToken(claims: EmailLinkClaims) {
  return new SignJWT({ uid: claims.userId, hid: claims.householdId, channel: claims.channel, kind: claims.kind })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('roomie-email').setAudience('roomie-unsubscribe').setIssuedAt().setExpirationTime('60d').sign(key());
}

export async function verifyEmailLinkToken(token: string): Promise<EmailLinkClaims> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: 'roomie-email', audience: 'roomie-unsubscribe', algorithms: ['HS256'] });
    const userId = Number(payload.uid), householdId = Number(payload.hid), channel = payload.channel, kind = payload.kind;
    if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(householdId) || householdId < 1 || channel !== 'email' || !['event_hosting', 'event_other', 'approval_request'].includes(String(kind))) throw new Error('invalid claims');
    return { userId, householdId, channel, kind: kind as EmailKind };
  } catch {
    throw new HttpError(400, 'This email link is invalid or has expired');
  }
}
