import { waitUntil } from '@vercel/functions';

/** Vercel keeps the promise alive after the response; local/security runs await it for deterministic tests. */
export async function runAfterResponse(promise: Promise<unknown>) {
  if (process.env.VERCEL) { waitUntil(promise); return; }
  try { await promise; } catch (error) { console.error('background task failed', error); }
}
