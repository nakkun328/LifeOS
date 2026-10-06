import { parseHm } from './time';

/** 次に迎える起床時刻までの残りミリ秒 */
export function remainingSleepMs(now: Date, wakeTime: string): number {
  const wake = new Date(now);
  const min = parseHm(wakeTime) ?? 360;
  wake.setHours(Math.floor(min / 60), min % 60, 0, 0);
  if (wake.getTime() <= now.getTime()) wake.setDate(wake.getDate() + 1);
  return wake.getTime() - now.getTime();
}

export function splitDuration(ms: number): { hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** 例: "6時間52分" / "42分" */
export function formatSleep(ms: number): string {
  const { hours, minutes } = splitDuration(ms);
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}
