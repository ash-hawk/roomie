export type EmailKind = 'event_hosting' | 'event_other' | 'approval_request';

export type EmailCandidate = {
  userId: number;
  email: string;
  current: boolean;
  channelVerified: boolean;
  enabledKinds: EmailKind[];
};

/** Deterministic recipient selection. The creator, moved-out, unverified, and opted-out users never pass. */
export function pickEventRecipients(event: {
  createdByUserId: number | null;
  category: string;
  notifyRoommates: boolean;
  taggedUserIds: number[];
}, candidates: EmailCandidate[]) {
  if (!event.notifyRoommates) return [];
  const tagged = new Set(event.taggedUserIds);
  return candidates.flatMap((candidate) => {
    if (!candidate.current || !candidate.channelVerified || candidate.userId === event.createdByUserId) return [];
    const kind: EmailKind = tagged.has(candidate.userId) ? 'approval_request' : event.category === 'hosting' ? 'event_hosting' : 'event_other';
    return candidate.enabledKinds.includes(kind) ? [{ userId: candidate.userId, email: candidate.email, kind }] : [];
  });
}

const icsText = (value: unknown) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function eventIcs(event: { eventId: number; eventName: string; eventDate: string; endDate?: string | null; location?: string | null; description?: string | null }, appOrigin: string) {
  const end = event.endDate ? utc(event.endDate) : utc(new Date(Date.parse(event.eventDate) + 60 * 60_000).toISOString());
  const host = new URL(appOrigin).host;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roomie//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:roomie-event-${event.eventId}@${host}`, `DTSTAMP:${utc(new Date().toISOString())}`, `DTSTART:${utc(event.eventDate)}`, `DTEND:${end}`,
    `SUMMARY:${icsText(event.eventName)}`, `LOCATION:${icsText(event.location)}`, `DESCRIPTION:${icsText(event.description)}`,
    `URL:${appOrigin.replace(/\/$/, '')}/#/calendar/${event.eventId}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
