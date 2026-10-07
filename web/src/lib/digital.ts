import { usageIn, type DigitalTotals } from './aggregate';
import { addDays, dayStart, DAY_BOUNDARY_MIN } from './jst';
import type { UsageRow } from './types';

export type DayDigital = {
  date: string;
  mac: DigitalTotals;
  iphone: DigitalTotals;
  /** 減らしたい時間の合計（Mac + iPhone、分） */
  minutes: number;
  /** 音楽・BGM（分）。合計には含めない */
  musicMinutes: number;
  /** その日の利用データが1行でもあるか（前日比を出してよいかの判断に使う） */
  hasData: boolean;
};

/** その日（朝6時〜翌朝6時）の利用時間。Mac と iPhone は分ける。reducible で「減らしたいサービス」を決める */
export function digitalDay(
  macRows: UsageRow[],
  iphoneRows: UsageRow[],
  key: string,
  reducible: (category: string) => boolean,
  boundaryMin = DAY_BOUNDARY_MIN,
): DayDigital {
  const from = dayStart(key, boundaryMin);
  const to = dayStart(addDays(key, 1), boundaryMin);
  const mac = usageIn(macRows, 'mac', from, to, reducible);
  const iphone = usageIn(iphoneRows, 'iphone', from, to, reducible);
  const hasData = [...macRows, ...iphoneRows].some((r) => {
    const s = Date.parse(r.start);
    return s + r.seconds * 1000 > from.getTime() && s < to.getTime();
  });
  return { date: key, mac, iphone, minutes: mac.minutes + iphone.minutes, musicMinutes: mac.musicMinutes + iphone.musicMinutes, hasData };
}

/** 前日との差（分）。どちらかにデータがなければ null（データがない日と、使わなかった日を区別するため） */
export const dayDiff = (day: DayDigital, prev: DayDigital): number | null => (day.hasData && prev.hasData ? day.minutes - prev.minutes : null);

/** 増減を数字だけで出す。例：−32分、+12分、±0分（評価の言葉は付けない） */
export function formatDelta(minutes: number, unit = '分'): string {
  const m = Math.round(minutes);
  if (m === 0) return `±0${unit}`;
  return `${m < 0 ? '−' : '+'}${Math.abs(m)}${unit}`;
}

/** 設定の「減らしたいサービス」「除外するサービス」から、減らしたい時間に数えるかの判定を作る */
export function makeReducible(d: { reduce: string[]; exclude: string[] }): (category: string) => boolean {
  const reduce = new Set(d.reduce.map((x) => x.toLowerCase()));
  const exclude = new Set(d.exclude.map((x) => x.toLowerCase()));
  return (c) => reduce.has(c.toLowerCase()) && !exclude.has(c.toLowerCase());
}
