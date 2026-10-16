import { minutesSinceRelease } from './settings';
import { parseHm } from './time';
import type { Settings, Stage } from './types';

const DAY_SEC = 86400;
const SATURDAY = 6;

type Boundary = { to: Stage; sec: number };

function secondsOfDay(d: Date): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/** 自動解除時刻を起点にした各段階の開始秒。昇順 */
function boundaries(s: Settings): { rel: number; list: Boundary[] } {
  const rel = parseHm(s.releaseTime)!;
  const at = (hm: string) => minutesSinceRelease(parseHm(hm)!, rel) * 60;
  return {
    rel,
    list: [
      { to: 'prepare', sec: at(s.prepareTime) },
      { to: 'soft', sec: at(s.softTime) },
      { to: 'hard', sec: at(s.hardTime) },
    ],
  };
}

function elapsedSinceRelease(now: Date, relMinutes: number): number {
  return (((secondsOfDay(now) - relMinutes * 60) % DAY_SEC) + DAY_SEC) % DAY_SEC;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * 「制限しない」時間か。Web の getGuardStage と同じ規則。
 * 今夜だけの指定がこの夜（夜の始まり＝自動解除の時刻の日付）に当たればその時刻まで（土曜の設定より優先）。
 * なければ、夜の始まりの曜日が土曜で、土曜の設定の時刻（日曜の未明）より前
 */
function isRelaxed(s: Settings, now: Date, t: number, rel: number): boolean {
  const start = new Date(now.getTime() - t * 1000);
  if (s.relaxOnce && s.relaxOnce.night === dateKey(start)) {
    const until = parseHm(s.relaxOnce.until);
    return until !== null && t < minutesSinceRelease(until, rel) * 60;
  }
  if (!s.relaxSaturdayUntil) return false;
  const until = parseHm(s.relaxSaturdayUntil);
  if (until === null) return false;
  return start.getDay() === SATURDAY && t < minutesSinceRelease(until, rel) * 60;
}

/** 現在時刻だけから決まる段階（アラームの発火には依存しない） */
export function getStage(s: Settings, now: Date): Stage {
  const { rel, list } = boundaries(s);
  const t = elapsedSinceRelease(now, rel);
  if (isRelaxed(s, now, t, rel)) return 'none';
  let stage: Stage = 'none';
  for (const b of list) if (t >= b.sec) stage = b.to;
  return stage;
}

/** 次に段階が変わる時刻（秒の境目に揃える）。土曜の夜の「制限しない」時間は、その終わりが次の変わり目になる */
export function getNextTransition(s: Settings, now: Date): { to: Stage; at: Date } {
  const { rel, list } = boundaries(s);
  const t = elapsedSinceRelease(now, rel);
  const base = now.getTime() - now.getMilliseconds() - t * 1000; // 直近の自動解除の時刻
  const current = getStage(s, now);
  const untils = [s.relaxSaturdayUntil, s.relaxOnce?.until].map((v) => (v ? parseHm(v) : null)).filter((v): v is number => v !== null);
  const offsets = [0, ...list.map((b) => b.sec), ...untils.map((u) => minutesSinceRelease(u, rel) * 60)].sort((a, b) => a - b);
  // 今より後の、時刻表の区切りを順に見て、段階が変わる最初のものを返す（「制限しない」夜は、区切りを過ぎても変わらないことがある）
  for (let day = 0; day < 8; day += 1) {
    for (const off of offsets) {
      const at = new Date(base + (day * DAY_SEC + off) * 1000);
      if (at.getTime() <= now.getTime()) continue;
      const to = getStage(s, at);
      if (to !== current) return { to, at };
    }
  }
  return { to: 'none', at: new Date(base + DAY_SEC * 1000) };
}
