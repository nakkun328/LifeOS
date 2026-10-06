import { parseHm } from './time';
import type { GuardEvent } from './types';

/** 直近の自動解除時刻（= 今夜の起点） */
export function nightStart(now: Date, releaseTime: string): Date {
  const min = parseHm(releaseTime) ?? 360;
  const d = new Date(now);
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1);
  return d;
}

/** 夜ごとの識別子（通知の重複防止用） */
export function nightKey(now: Date, releaseTime: string): string {
  const d = nightStart(now, releaseTime);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function countUnlocksTonight(events: GuardEvent[], now: Date, releaseTime: string): number {
  const start = nightStart(now, releaseTime).getTime();
  return events.filter((e) => e.kind === 'unlocked' && Date.parse(e.at) >= start).length;
}
