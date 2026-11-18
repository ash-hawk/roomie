// Pure, non-AI helpers for the Home page. No I/O here, so both the browser and server can use them.
import { addDays } from './chore-dates.js';

/** Items whose local calendar day falls in [today, today + days - 1]. `ymd` is the household-timezone day. */
export function pickWeek<T extends { ymd: string }>(items: T[], todayYmd: string, days = 7): T[] {
  const last = addDays(todayYmd, days - 1);
  return items.filter((i) => i.ymd >= todayYmd && i.ymd <= last);
}

export const greeting = (hour: number) => (hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
