// Asia/Tokyo（DST なし = 常に UTC+9）。1日の区切りは朝（既定 06:00）。
const JST_MS = 9 * 3600_000;
const MIN = 60_000;
const DAY_MS = 86_400_000;
export const DAY_BOUNDARY_MIN = 360;

type Parts = { y: number; m: number; d: number; hh: number; mm: number; dow: number };

export function jstParts(d: Date): Parts {
  const t = new Date(d.getTime() + JST_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
    dow: t.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 朝（boundary）で区切った「その日」。深夜 01:00 は前日になる */
export function dayKey(d: Date, boundaryMin = DAY_BOUNDARY_MIN): string {
  const t = new Date(d.getTime() + JST_MS - boundaryMin * MIN);
  return key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** その日の開始（= 朝 06:00 JST）の瞬間 */
export function dayStart(k: string, boundaryMin = DAY_BOUNDARY_MIN): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!) - JST_MS + boundaryMin * MIN);
}

export function addDays(k: string, n: number): string {
  const [y, m, d] = k.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d!) + n * DAY_MS);
  return key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0=日 … 6=土 */
export function dayOfWeek(k: string): number {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** その日を含む週の月曜 */
export function weekStartKey(k: string): string {
  const dow = dayOfWeek(k);
  return addDays(k, -((dow + 6) % 7));
}

export function minutesOfDayJst(d: Date): number {
  const p = jstParts(d);
  return p.hh * 60 + p.mm;
}

/** 就寝時刻を正午起点の分にする。23:50 → 710、00:20 → 740（30分遅い） */
export function bedMinutes(d: Date): number {
  return (minutesOfDayJst(d) - 720 + 1440) % 1440;
}

export function formatBedMinutes(m: number): string {
  const total = (Math.round(m) + 720) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function formatClock(d: Date): string {
  const p = jstParts(d);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

/**
 * 日時文字列を Date にする。タイムゾーン付きの ISO はそのまま、
 * "YYYY-MM-DD HH:mm(:ss)" や "YYYY-MM-DDTHH:mm(:ss)"（TZなし）は JST として扱う。
 */
export function parseInstant(s: unknown): Date | null {
  if (typeof s !== 'string') return null;
  const str = s.trim();
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str);
  if (naive) {
    const [, y, mo, d, h, mi, se] = naive;
    return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +(se ?? 0)) - JST_MS);
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(str)) return null;
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : new Date(t);
}

/** "HH:MM" → 分 */
export function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = +m[1]!;
  const mi = +m[2]!;
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}
