import { DAY_BOUNDARY_MIN, parseHm } from '@/lib/jst';

/** 起床時刻などの設定は、DB の Settings が唯一の正（環境変数 LIFEOS_WAKE_TIME は廃止） */
export type Config = {
  /** 「夜」の集計を始める時刻（23:30）の分 */
  afterMin: number;
  boundaryMin: number;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    afterMin: parseHm(env.LIFEOS_NIGHT_AFTER ?? '23:30') ?? 23 * 60 + 30,
    boundaryMin: DAY_BOUNDARY_MIN,
  };
}

export const DEFAULT_CONFIG: Config = loadConfig({});
