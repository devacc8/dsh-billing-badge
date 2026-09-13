/**
 * Billing season logic for DeepSeek's time-of-day pricing.
 *
 * The rule is fixed and published: peak windows are Beijing time, Monday to
 * Friday, 09:00-12:00 and 14:00-18:00. Everything else, including all of
 * Saturday and Sunday, is off-peak and billed at half the peak price.
 *
 * Timezone handling: the rule is defined in Beijing time (UTC+8), so every
 * calculation shifts the instant by a fixed offset and reads the UTC fields.
 * Local timezones are never used for the decision, only for display.
 *
 * @module season
 */

/** Beijing time is UTC+8. */
export const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Peak windows in Beijing time, as [from, to) minutes after midnight. */
export const PEAK_WINDOWS = [
  [9 * 60, 12 * 60],
  [14 * 60, 18 * 60],
];

/** Candidate boundary minutes: midnight plus every window edge. */
const BOUNDARY_MINUTES = [0, 9 * 60, 12 * 60, 14 * 60, 18 * 60];

/** Milliseconds in a day, for candidate generation. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether an instant falls in a peak window (Beijing time, Monday to Friday).
 *
 * Weekend days return false before any window is tested. Comparing only the
 * clock would report a peak window every Saturday and Sunday, six hours of
 * false peak per week, which is the mistake this module exists to avoid.
 *
 * @param {Date} [at] - Instant to test, defaults to now.
 * @returns {boolean} True when the instant is peak.
 */
export function isPeak(at = new Date()) {
  const beijing = new Date(at.getTime() + BEIJING_OFFSET_MS);
  const day = beijing.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
  return PEAK_WINDOWS.some(([from, to]) => minutes >= from && minutes < to);
}

/**
 * Beijing midnight of the day that contains an instant, as an absolute time.
 *
 * @param {number} timeMs - Instant in milliseconds.
 * @returns {number} The instant of Beijing midnight.
 */
function beijingMidnight(timeMs) {
  const beijing = new Date(timeMs + BEIJING_OFFSET_MS);
  return Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate()) - BEIJING_OFFSET_MS;
}

/**
 * The next instant at which the season actually flips.
 *
 * Candidate boundaries are generated for the next ten days, then each is
 * accepted only when the state one millisecond before it differs from the state
 * at it. That filter is the point: Friday 18:00 ends the peak week, but the
 * following boundary, Saturday 09:00, changes nothing because the whole weekend
 * is already off-peak. Reporting it would show a countdown to an event that
 * does not happen, so the honest answer is Monday 09:00.
 *
 * @param {Date} [at] - Instant to search from, defaults to now.
 * @returns {number|null} Absolute time of the flip, or null when none is found.
 */
export function nextFlip(at = new Date()) {
  const from = at.getTime();
  const midnight = beijingMidnight(from);
  const candidates = [];
  for (let day = 0; day <= 10; day += 1) {
    const base = midnight + day * DAY_MS;
    for (const minutes of BOUNDARY_MINUTES) candidates.push(base + minutes * 60 * 1000);
  }
  candidates.sort((a, b) => a - b);
  for (const candidate of candidates) {
    if (candidate <= from) continue;
    if (isPeak(new Date(candidate)) !== isPeak(new Date(candidate - 1))) return candidate;
  }
  return null;
}

/**
 * Remaining time until an instant, as a compact label.
 *
 * @param {number} ms - Milliseconds remaining.
 * @returns {string} `2h13m`, `45m` or `38s`.
 */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Beijing wall clock of an instant, for the popover.
 *
 * @param {Date} [at] - Instant to describe, defaults to now.
 * @returns {{weekday: string, clock: string}} Weekday name and HH:MM.
 */
export function beijingClock(at = new Date()) {
  const beijing = new Date(at.getTime() + BEIJING_OFFSET_MS);
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hh = String(beijing.getUTCHours()).padStart(2, '0');
  const mm = String(beijing.getUTCMinutes()).padStart(2, '0');
  return { weekday: weekdays[beijing.getUTCDay()], clock: `${hh}:${mm}` };
}

/**
 * Everything the chip and its popover need for one instant.
 *
 * @param {Date} [at] - Instant to describe, defaults to now.
 * @returns {object} Phase description.
 */
export function describePhase(at = new Date()) {
  const peak = isPeak(at);
  const flip = nextFlip(at);
  const remaining = flip === null ? null : flip - at.getTime();
  const countdown = remaining === null ? '' : formatCountdown(remaining);
  const { weekday, clock } = beijingClock(at);
  const label = peak ? 'Peak' : 'Off-peak';
  const compact = peak ? 'Peak' : 'Off-peak';
  const nextLabel = peak ? 'Off-peak' : 'Peak';
  return {
    peak,
    label,
    compact,
    countdown,
    flipAt: flip,
    remainingMs: remaining,
    nextLabel,
    beijing: { weekday, clock },
    /** Single source of truth for the two state colors, used by chip and popover. */
    color: peak ? '#D9A24A' : '#57C07C',
    title: peak
      ? `Peak billing until ${countdown} from now (${nextLabel} after that). Beijing time ${weekday} ${clock}.`
      : `Off-peak billing, half price, for another ${countdown}. Beijing time ${weekday} ${clock}.`,
  };
}
