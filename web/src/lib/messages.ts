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

/** 週の平均就寝の比較。数字を中心に、責めない言い方で */
export function weekBedMessage(diffMin: number | null): string | null {
  if (diffMin === null) return null;
  const m = Math.abs(Math.round(diffMin));
  if (m === 0) return '先週と同じ平均就寝です';
  return diffMin < 0 ? `先週より${m}分早い平均就寝です` : `先週より${m}分遅めの平均就寝です`;
}

export function weekDurationMessage(diffMin: number | null): string | null {
  if (diffMin === null) return null;
  const m = Math.abs(Math.round(diffMin));
  if (m === 0) return '先週と同じ平均睡眠時間です';
  return diffMin > 0 ? `先週より平均${m}分長く眠れています` : `先週より平均${m}分短めです`;
}

/** 分を「6時間47分」の形に */
export function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}時間${m % 60}分` : `${m}分`;
}
