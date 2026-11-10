import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema as s } from './db.js';
import { HttpError } from './http.js';
import { emailProviderConfigured, sendEmail } from './email-provider.js';

const CHANNEL = 'email' as const;
const MAX_CONFIRMATIONS_PER_HOUR = 3;

function hashSecret() {
  const secret = process.env.NOTIFICATION_HASH_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, 'Notification confirmation is not configured');
  return secret;
}

export function normalizeNotificationEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim() : '';
  const normalized = email.toLowerCase();
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  return { destination: email, normalized };
}

export const confirmationTokenHash = (token: string) => createHash('sha256').update(token).digest();
export const destinationHash = (normalizedDestination: string) => createHmac('sha256', hashSecret()).update(`${CHANNEL}\0${normalizedDestination}`).digest();

export function destinationMatches(stored: Buffer, currentNormalizedDestination: string) {
  const current = destinationHash(currentNormalizedDestination);
  return stored.length === current.length && timingSafeEqual(stored, current);
}

function confirmationConfigured() {
  if (!emailProviderConfigured() || !process.env.APP_ORIGIN) return false;
  try { return /^https?:$/.test(new URL(process.env.APP_ORIGIN).protocol); } catch { return false; }
}

export async function readNotificationChannel(userId: number) {
  const [row] = await db.select({ destination: s.notificationChannel.destination, verifiedAt: s.notificationChannel.verifiedAt })
    .from(s.notificationChannel).where(and(eq(s.notificationChannel.userId, userId), eq(s.notificationChannel.channel, CHANNEL)));
  return row ? { channel: CHANNEL, destination: row.destination, verifiedAt: row.verifiedAt } : null;
}

async function sendConfirmationEmail(confirmationId: number, destination: string, token: string) {
  const origin = process.env.APP_ORIGIN!.replace(/\/$/, '');
  const url = `${origin}/api/email/confirm?t=${encodeURIComponent(token)}`;
  try {
    await sendEmail({
      to: destination,
      subject: 'Confirm your Roomie notification email',
      text: `Confirm this address for Roomie event notifications. This link expires in 24 hours:\n\n${url}`,
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#20202a"><h1 style="font-size:24px">Confirm your Roomie email</h1><p>Use this address for important event notifications from your roommates.</p><p><a href="${url}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px">Confirm email</a></p><p style="color:#666474;font-size:13px">This link expires in 24 hours. If you did not request it, you can ignore this email.</p></body></html>`,
      idempotencyKey: `notification-confirm-${confirmationId}`,
    });
  } catch {
    throw new HttpError(502, 'Could not send the confirmation email');
  }
}

export async function requestNotificationConfirmation(userId: number, value: unknown) {
  if (!confirmationConfigured()) throw new HttpError(503, 'Notification confirmation is not configured');
  const { destination, normalized } = normalizeNotificationEmail(value);
  const addressHash = destinationHash(normalized);
  const addressHex = addressHash.toString('hex');
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = confirmationTokenHash(rawToken);

  const confirmation = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`roomie-confirm-user:${userId}`}, 0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`roomie-confirm-address:${addressHex}`}, 0))`);
    const counts = await tx.execute(sql`SELECT
      count(*) FILTER (WHERE user_id = ${userId})::int AS user_count,
      count(*) FILTER (WHERE channel = ${CHANNEL} AND destination_hash = ${addressHash})::int AS address_count
      FROM notification_channel_confirmation WHERE created_at >= now() - interval '1 hour'`);
    const count = counts.rows[0] as { user_count: number; address_count: number };
    if (Number(count.user_count) >= MAX_CONFIRMATIONS_PER_HOUR || Number(count.address_count) >= MAX_CONFIRMATIONS_PER_HOUR) {
      throw new HttpError(429, 'Too many confirmation emails. Try again in an hour.');
    }
    await tx.insert(s.notificationChannel).values({ userId, channel: CHANNEL, destination, normalizedDestination: normalized })
      .onConflictDoUpdate({ target: [s.notificationChannel.userId, s.notificationChannel.channel], set: { destination, normalizedDestination: normalized } });
    const inserted = await tx.execute(sql`INSERT INTO notification_channel_confirmation
      (user_id, channel, destination_hash, token_hash) VALUES (${userId}, ${CHANNEL}, ${addressHash}, ${tokenHash})
      RETURNING confirmation_id`);
    return { confirmationId: Number((inserted.rows[0] as { confirmation_id: string }).confirmation_id), token: rawToken };
  });
  await sendConfirmationEmail(confirmation.confirmationId, destination, confirmation.token);
  return readNotificationChannel(userId);
}

export async function confirmNotificationChannel(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new HttpError(400, 'This confirmation link is invalid or expired');
  const tokenHash = confirmationTokenHash(token);
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`SELECT confirmation_id, user_id, channel, destination_hash
      FROM notification_channel_confirmation
      WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
      FOR UPDATE`);
    const confirmation = result.rows[0] as { confirmation_id: string; user_id: string; channel: string; destination_hash: Buffer } | undefined;
    if (!confirmation || confirmation.channel !== CHANNEL) throw new HttpError(400, 'This confirmation link is invalid or expired');
    const [channel] = await tx.select({ normalized: s.notificationChannel.normalizedDestination }).from(s.notificationChannel)
      .where(and(eq(s.notificationChannel.userId, Number(confirmation.user_id)), eq(s.notificationChannel.channel, CHANNEL))).for('update');
    if (!channel || !destinationMatches(confirmation.destination_hash, channel.normalized)) throw new HttpError(400, 'This address has changed. Request a new confirmation email.');
    const claimed = await tx.execute(sql`UPDATE notification_channel_confirmation SET used_at = now()
      WHERE confirmation_id = ${Number(confirmation.confirmation_id)} AND used_at IS NULL RETURNING confirmation_id`);
    if (!claimed.rows.length) throw new HttpError(400, 'This confirmation link has already been used');
    await tx.update(s.notificationChannel).set({ verifiedAt: new Date().toISOString() }).where(and(
      eq(s.notificationChannel.userId, Number(confirmation.user_id)), eq(s.notificationChannel.channel, CHANNEL),
      eq(s.notificationChannel.normalizedDestination, channel.normalized),
    ));
    return { destination: channel.normalized };
  });
}
