import { minutesSinceRelease } from './settings';
import { parseHm } from './time';
import type { Settings, Stage } from './types';

const DAY_SEC = 86400;

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

/** 現在時刻だけから決まる段階（アラームの発火には依存しない） */
export function getStage(s: Settings, now: Date): Stage {
  const { rel, list } = boundaries(s);
  const t = elapsedSinceRelease(now, rel);
  let stage: Stage = 'none';
  for (const b of list) if (t >= b.sec) stage = b.to;
  return stage;
}

/** 次に段階が変わる時刻（秒の境目に揃える） */
export function getNextTransition(s: Settings, now: Date): { to: Stage; at: Date } {
  const { rel, list } = boundaries(s);
  const t = elapsedSinceRelease(now, rel);
  const next = list.find((b) => b.sec > t) ?? { to: 'none' as Stage, sec: DAY_SEC };
  const ms = now.getTime() - now.getMilliseconds() + (next.sec - t) * 1000;
  return { to: next.to, at: new Date(ms) };
}
