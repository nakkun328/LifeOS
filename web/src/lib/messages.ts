import { formatBedMinutes } from './jst';

/** 責めずに、改善量で伝える */
export function bedDiffMessage(diffMinutes: number | null): string | null {
  if (diffMinutes === null) return null;
  const m = Math.abs(Math.round(diffMinutes));
  if (m === 0) return '昨日と同じ時刻に寝ました';
  return diffMinutes < 0 ? `昨日より${m}分早く寝ました` : `昨日より${m}分遅めでした`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

export function formatAvgBed(avgMinutes: number | null): string {
  return avgMinutes === null ? '--:--' : formatBedMinutes(avgMinutes);
}

/** 起床時刻 "HH:MM" までの残りミリ秒 */
export function sleepRemainingMs(nowMs: number, nowMinutesJst: number, wakeMin: number): number {
  let diff = wakeMin - nowMinutesJst;
  if (diff <= 0) diff += 1440;
  return diff * 60_000 - (nowMs % 60_000);
}

/** 期限までの残り日数を、責めない言葉で */
export function dueMessage(daysLeft: number): string {
  if (daysLeft > 0) return `あと${daysLeft}日`;
  if (daysLeft === 0) return '今日が期限';
  return `期限から${-daysLeft}日（落ち着いて、できるところから）`;
}
