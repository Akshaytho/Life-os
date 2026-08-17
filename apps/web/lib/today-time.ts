export type TodayRange = {
  from: string;
  to: string;
};

/**
 * Build a half-open [local midnight, next local midnight) window and only then
 * convert its endpoints to UTC. Using calendar-day arithmetic instead of adding
 * 24 hours preserves the user's local day across daylight-saving transitions.
 */
export function todayRange(now: Date = new Date()): TodayRange {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  return { from: from.toISOString(), to: to.toISOString() };
}
