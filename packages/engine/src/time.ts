/**
 * ChronoMap time model (contract §3).
 *
 * A When is an EDTF (ISO 8601-2) subset:
 *   point     1825 | 1825-07 | 1825-07-20 | 1825-07-20T14:30[:05]
 *   qualifier ? uncertain, ~ approximate, % both
 *   interval  A/B, with ".." for an open end
 * Years use astronomical numbering (0000 = 1 BCE, -0043 = 44 BCE), four digits.
 *
 * Everything resolves to ticks: integer seconds since 1970-01-01T00:00:00 in the
 * proleptic Gregorian calendar, no time zone, negative before 1970 (i64 in Rust).
 * Never pass a raw When to JS `Date`: V8 reads "-0044-03-15" as the year 2044.
 */
import type { Span, Ticks } from './types.js';

const DATE_RE = /^(-?)(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?)?)?([?~%])?$/;
const SECONDS_PER_DAY = 86400;

export type Precision = 'year' | 'month' | 'day' | 'minute' | 'second';
export type Qualifier = 'uncertain' | 'approximate' | 'uncertain-approximate';
export const QUALIFIERS: Record<string, Qualifier> = { '?': 'uncertain', '~': 'approximate', '%': 'uncertain-approximate' };

export interface ParsedDate {
  text: string; precision: Precision; qualifier: Qualifier | null;
  year: number; month: number | null; day: number | null;
  hour: number | null; minute: number | null; second: number | null;
  start: Ticks; end: Ticks;
}
export interface ParsedWhen {
  text: string; isInterval: boolean;
  from: ParsedDate | null; to: ParsedDate | null;
  start: Ticks | null; end: Ticks | null;
}
export class WhenError extends Error {}

/** Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
/** Inverse of daysFromCivil. */
export function civilFromDays(z: number): { year: number; month: number; day: number } {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}
export const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number): number =>
  [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

export function parseDate(text: string): ParsedDate {
  const m = DATE_RE.exec(text);
  if (!m) throw new WhenError(`"${text}" is not a valid date (expected YYYY, YYYY-MM, YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS], optional ?~% suffix)`);
  const [, sign, yStr, moStr, dStr, hStr, miStr, sStr, q] = m;
  if (sign === '-' && yStr === '0000') throw new WhenError(`"${text}": -0000 is not allowed; year zero is 0000`);
  const year = sign === '-' ? -Number(yStr) : Number(yStr);
  const month = moStr ? Number(moStr) : null;
  const day = dStr ? Number(dStr) : null;
  const hour = hStr ? Number(hStr) : null;
  const minute = miStr ? Number(miStr) : null;
  const second = sStr ? Number(sStr) : null;

  if (month !== null && (month < 1 || month > 12)) throw new WhenError(`"${text}": month ${month} out of range`);
  if (day !== null && (day < 1 || day > daysInMonth(year, month as number))) throw new WhenError(`"${text}": day ${day} does not exist in ${year}-${String(month).padStart(2, '0')}`);
  if (hour !== null && hour > 23) throw new WhenError(`"${text}": hour out of range`);
  if (minute !== null && minute > 59) throw new WhenError(`"${text}": minute out of range`);
  if (second !== null && second > 59) throw new WhenError(`"${text}": second out of range`);

  let precision: Precision, start: number, end: number;
  if (month === null) {
    precision = 'year';
    start = daysFromCivil(year, 1, 1) * SECONDS_PER_DAY;
    end = daysFromCivil(year + 1, 1, 1) * SECONDS_PER_DAY;
  } else if (day === null) {
    precision = 'month';
    start = daysFromCivil(year, month, 1) * SECONDS_PER_DAY;
    end = (month === 12 ? daysFromCivil(year + 1, 1, 1) : daysFromCivil(year, month + 1, 1)) * SECONDS_PER_DAY;
  } else if (hour === null) {
    precision = 'day';
    start = daysFromCivil(year, month, day) * SECONDS_PER_DAY;
    end = start + SECONDS_PER_DAY;
  } else if (second === null) {
    precision = 'minute';
    start = daysFromCivil(year, month, day) * SECONDS_PER_DAY + hour * 3600 + (minute as number) * 60;
    end = start + 60;
  } else {
    precision = 'second';
    start = daysFromCivil(year, month, day) * SECONDS_PER_DAY + hour * 3600 + (minute as number) * 60 + second;
    end = start + 1;
  }
  return { text, precision, qualifier: q ? QUALIFIERS[q] : null, year, month, day, hour, minute, second, start, end };
}

export function parseWhen(text: string): ParsedWhen {
  if (typeof text !== 'string' || text.length === 0) throw new WhenError('when must be a non-empty string');
  const parts = text.split('/');
  if (parts.length > 2) throw new WhenError(`"${text}": more than one "/"`);
  if (parts.length === 1) {
    if (text === '..') throw new WhenError('".." is only valid as an interval end');
    const d = parseDate(text);
    return { text, isInterval: false, from: d, to: d, start: d.start, end: d.end };
  }
  const [a, b] = parts;
  if (a === '..' && b === '..') throw new WhenError(`"${text}": both ends open`);
  if (a === '' || b === '') throw new WhenError(`"${text}": empty (unknown) interval ends are not supported in v1; use ".." for open`);
  const from = a === '..' ? null : parseDate(a);
  const to = b === '..' ? null : parseDate(b);
  if (from && to && to.start < from.start) throw new WhenError(`"${text}": interval ends before it starts`);
  return { text, isInterval: true, from, to, start: from ? from.start : null, end: to ? to.end : null };
}

/** Replace open ends with the campaign timeline extent. */
export function resolveWhen(when: string | ParsedWhen, extent: Span): ParsedWhen & { start: Ticks; end: Ticks } {
  const w = typeof when === 'string' ? parseWhen(when) : when;
  return { ...w, start: w.start ?? extent.start, end: w.end ?? extent.end };
}

const pad2 = (n: number): string => (n < 10 ? '0' + n : '' + n);
const pad4 = (n: number): string => (n < 10 ? '000' + n : n < 100 ? '00' + n : n < 1000 ? '0' + n : '' + n);
const pad6 = (n: number): string => String(n).padStart(6, '0');

/** Ticks → ISO-like string (expanded years outside 0000-9999), used by test vectors. */
export function ticksToIso(ticks: Ticks): string {
  const days = Math.floor(ticks / SECONDS_PER_DAY);
  let rem = ticks - days * SECONDS_PER_DAY;
  const { year, month, day } = civilFromDays(days);
  const hh = Math.floor(rem / 3600); rem -= hh * 3600;
  const mm = Math.floor(rem / 60); const ss = rem - mm * 60;
  const y = year >= 0 && year <= 9999 ? pad4(year) : (year < 0 ? '-' : '+') + pad6(Math.abs(year));
  return `${y}-${pad2(month)}-${pad2(day)}T${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}
