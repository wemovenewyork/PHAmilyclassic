/**
 * Format an ISO timestamp (or Date) as a short human-readable relative time.
 *
 * Used by the donor wall and likely by the thanks page and any future
 * admin reconciliation view. Server-side, so `now` is the server clock
 * at the moment the page is rendered. No locale handling — strings are
 * American English by design (the event is NY/NJ).
 *
 * Bands:
 *   < 1 minute        → "Just now"
 *   < 1 hour          → "5 min ago"
 *   < 24 hours        → "2 hours ago" / "1 hour ago"
 *   24-48 hours       → "Yesterday"
 *   < 7 days          → "3 days ago" (always plural — we enter this branch at 2+ days)
 *   same calendar yr  → "Aug 12"
 *   older             → "Aug 12, 2025"
 *
 * Negative diffs (input in the future, e.g. clock skew between web and DB)
 * are clamped to 0 → "Just now".
 */
export function formatRelativeTime(input: string | Date): string {
  const then = input instanceof Date ? input : new Date(input);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - then.getTime());

  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (diffMs < MIN) return 'Just now';
  if (diffMs < HOUR) {
    const mins = Math.floor(diffMs / MIN);
    return `${mins} min ago`;
  }
  if (diffMs < DAY) {
    const hours = Math.floor(diffMs / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diffMs < 2 * DAY) return 'Yesterday';
  if (diffMs < 7 * DAY) {
    const days = Math.floor(diffMs / DAY);
    return `${days} days ago`;
  }

  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = MONTHS[then.getMonth()];
  const day = then.getDate();
  const year = then.getFullYear();

  if (year === now.getFullYear()) return `${month} ${day}`;
  return `${month} ${day}, ${year}`;
}
