import { parseHm } from '@/lib/jst';
import { DAY_BOUNDARY_MIN } from '@/lib/jst';

export type Config = {
  /** 起床時刻（「今寝れば」の計算用） */
  wakeTime: string;
  /** 「夜」の集計を始める時刻（23:30）の分 */
  afterMin: number;
  boundaryMin: number;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const wake = env.LIFEOS_WAKE_TIME ?? '06:15';
  return {
    wakeTime: parseHm(wake) === null ? '06:15' : wake,
    afterMin: parseHm(env.LIFEOS_NIGHT_AFTER ?? '23:30') ?? 23 * 60 + 30,
    boundaryMin: DAY_BOUNDARY_MIN,
  };
}

export const DEFAULT_CONFIG: Config = loadConfig({});
