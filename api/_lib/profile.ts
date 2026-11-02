import { HttpError } from './http.js';
import { optStr, str } from './validate.js';

const APPS = ['venmo', 'zelle', 'apple_cash'] as const;
type PaymentApp = (typeof APPS)[number];

export type ProfileUpdate = {
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  profilePhoto: string | null;
  paymentMethods: { app: PaymentApp; username: string; isPreferred: boolean }[];
};

function photoUrl(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Profile photo is invalid');
  const raw = value.trim();
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)) {
    if (raw.length > 400_000) throw new HttpError(400, 'Profile photo is too large');
    return raw;
  }
  if (raw.length > 500) throw new HttpError(400, 'Profile photo URL is too long');
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpError(400, 'Profile photo must be a valid HTTPS URL'); }
  if (url.protocol !== 'https:') throw new HttpError(400, 'Profile photo must use HTTPS');
  return url.toString();
}

export function parseProfileUpdate(value: unknown): ProfileUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Profile must be an object');
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.paymentMethods) || input.paymentMethods.length > APPS.length) throw new HttpError(400, 'Payment methods must be a list of supported apps');

  const seen = new Set<string>();
  const methods = input.paymentMethods.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Invalid payment method');
    const method = raw as Record<string, unknown>;
    if (typeof method.app !== 'string' || !APPS.includes(method.app as PaymentApp)) throw new HttpError(400, 'Unsupported payment app');
    if (seen.has(method.app)) throw new HttpError(400, 'Each payment app can only be added once');
    seen.add(method.app);
    return { app: method.app as PaymentApp, username: str(method.username, 1, 120, 'Payment handle'), isPreferred: method.isPreferred === true };
  });
  if (methods.filter((m) => m.isPreferred).length > 1) throw new HttpError(400, 'Choose only one preferred payment app');
  if (methods.length && !methods.some((m) => m.isPreferred)) methods[0]!.isPreferred = true;

  return {
    firstName: str(input.firstName, 1, 80, 'First name'),
    lastName: str(input.lastName, 0, 80, 'Last name'),
    phoneNumber: optStr(input.phoneNumber, 40, 'Phone number'),
    profilePhoto: photoUrl(input.profilePhoto),
    paymentMethods: methods,
  };
}
