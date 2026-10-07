// Life OS の設定（唯一の正。DB の settings テーブルに1行で持つ）。
// 拡張はこれを API から取得して使う。Sleep と Night Guard は、制限中は変更できない（サーバー側で拒否）。
import { jstParts, parseHm } from './jst';

export type SleepSettings = {
  /** 目標就寝時刻 "HH:MM" */
  targetBed: string;
  /** 起床予定時刻 "HH:MM"（「今寝れば◯時間」の計算に使う） */
  wakeTime: string;
};

export type GuardSettings = {
  prepareTime: string; // 寝る準備の通知
  level1Time: string; // Shorts・X・Instagram・TikTok を制限
  level2Time: string; // YouTube 全体も制限
  releaseTime: string; // 自動解除
  waitSeconds: number;
  unlockMinutes: number;
  /** 許可する再生リストの ID */
  allowedPlaylists: string[];
};

export type DigitalSettings = {
  /** 減らしたいサービス（利用時間のカテゴリ名／iPhone のアプリ名、小文字） */
  reduce: string[];
  /** 除外するサービス（減らしたい時間に含めない） */
  exclude: string[];
};

export type AppSettings = { sleep: SleepSettings; guard: GuardSettings; digital: DigitalSettings };

export const KNOWN_SERVICES = ['youtube', 'youtube_shorts', 'x', 'instagram', 'tiktok', 'youtube_music'] as const;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  sleep: { targetBed: '23:30', wakeTime: '06:15' },
  guard: {
    prepareTime: '22:45',
    level1Time: '23:15',
    level2Time: '23:30',
    releaseTime: '06:00',
    waitSeconds: 30,
    unlockMinutes: 10,
    allowedPlaylists: [],
  },
  digital: {
    reduce: ['youtube', 'youtube_shorts', 'x', 'instagram', 'tiktok'],
    exclude: ['youtube_music'],
  },
};

const DAY = 1440;
const sinceRelease = (m: number, rel: number) => (((m - rel) % DAY) + DAY) % DAY;

export function validateSleep(s: SleepSettings): string[] {
  const errors: string[] = [];
  if (parseHm(s.targetBed) === null) errors.push('目標就寝時刻の形式が正しくありません');
  if (parseHm(s.wakeTime) === null) errors.push('起床予定時刻の形式が正しくありません');
  return errors;
}

export function validateGuard(g: GuardSettings): string[] {
  const errors: string[] = [];
  const times: Array<[string, string]> = [
    ['寝る準備の通知', g.prepareTime],
    ['Level 1', g.level1Time],
    ['Level 2', g.level2Time],
    ['自動解除', g.releaseTime],
  ];
  for (const [label, v] of times) if (parseHm(v) === null) errors.push(`${label}の時刻の形式が正しくありません`);
  if (errors.length === 0) {
    const rel = parseHm(g.releaseTime)!;
    const p = sinceRelease(parseHm(g.prepareTime)!, rel);
    const l1 = sinceRelease(parseHm(g.level1Time)!, rel);
    const l2 = sinceRelease(parseHm(g.level2Time)!, rel);
    if (p === 0 || l1 === 0 || l2 === 0) errors.push('各時刻は、自動解除の時刻と別にしてください');
    else if (!(p < l1 && l1 < l2)) errors.push('時刻は「通知 → Level 1 → Level 2」の順にしてください');
  }
  if (!Number.isInteger(g.waitSeconds) || g.waitSeconds < 0 || g.waitSeconds > 600) errors.push('待ち時間は 0〜600 秒の整数にしてください');
  if (!Number.isInteger(g.unlockMinutes) || g.unlockMinutes < 1 || g.unlockMinutes > 180) errors.push('解除時間は 1〜180 分の整数にしてください');
  if (g.allowedPlaylists.length > 100) errors.push('許可する再生リストは 100 件までです');
  return errors;
}

export function validateDigital(d: DigitalSettings): string[] {
  const errors: string[] = [];
  for (const [label, list] of [['減らしたいサービス', d.reduce], ['除外するサービス', d.exclude]] as const) {
    if (list.length > 50) errors.push(`${label}は 50 件までです`);
    if (list.some((s) => s.length === 0 || s.length > 40)) errors.push(`${label}の名前は 1〜40 文字にしてください`);
  }
  return errors;
}

export function validateAppSettings(s: AppSettings): string[] {
  return [...validateSleep(s.sleep), ...validateGuard(s.guard), ...validateDigital(s.digital)];
}

const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const strList = (v: unknown, d: string[], lower = false) =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => (lower ? x.trim().toLowerCase() : x.trim())).filter(Boolean))]
    : d;

/** 保存値（または入力）と初期値を合成する。型が違うもの・検証に通らない節は初期値に戻す */
export function mergeAppSettings(raw: unknown, base: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const sleepRaw = r.sleep ?? {};
  const guardRaw = r.guard ?? {};
  const digitalRaw = r.digital ?? {};
  const sleep: SleepSettings = {
    targetBed: str(sleepRaw.targetBed, base.sleep.targetBed),
    wakeTime: str(sleepRaw.wakeTime, base.sleep.wakeTime),
  };
  const guard: GuardSettings = {
    prepareTime: str(guardRaw.prepareTime, base.guard.prepareTime),
    level1Time: str(guardRaw.level1Time, base.guard.level1Time),
    level2Time: str(guardRaw.level2Time, base.guard.level2Time),
    releaseTime: str(guardRaw.releaseTime, base.guard.releaseTime),
    waitSeconds: num(guardRaw.waitSeconds, base.guard.waitSeconds),
    unlockMinutes: num(guardRaw.unlockMinutes, base.guard.unlockMinutes),
    allowedPlaylists: strList(guardRaw.allowedPlaylists, base.guard.allowedPlaylists),
  };
  const digital: DigitalSettings = {
    reduce: strList(digitalRaw.reduce, base.digital.reduce, true),
    exclude: strList(digitalRaw.exclude, base.digital.exclude, true),
  };
  return {
    sleep: validateSleep(sleep).length === 0 ? sleep : { ...DEFAULT_APP_SETTINGS.sleep },
    guard: validateGuard(guard).length === 0 ? guard : { ...DEFAULT_APP_SETTINGS.guard, allowedPlaylists: [] },
    digital: validateDigital(digital).length === 0 ? digital : { ...DEFAULT_APP_SETTINGS.digital },
  };
}

// ---- Night Guard の段階（拡張の core/stage.ts と同じ判定。こちらは日本時間で判定する） ----

export type GuardStage = 'none' | 'prepare' | 'soft' | 'hard';

/** 自動解除時刻を起点にした「夜の経過秒」 */
function elapsedSinceRelease(now: Date, releaseMin: number): number {
  const p = jstParts(now);
  const sec = p.hh * 3600 + p.mm * 60 + Math.floor((now.getTime() % 60_000) / 1000);
  return (((sec - releaseMin * 60) % 86400) + 86400) % 86400;
}

export function getGuardStage(g: GuardSettings, now: Date): GuardStage {
  const rel = parseHm(g.releaseTime)!;
  const at = (hm: string) => sinceRelease(parseHm(hm)!, rel) * 60;
  const t = elapsedSinceRelease(now, rel);
  if (t >= at(g.level2Time)) return 'hard';
  if (t >= at(g.level1Time)) return 'soft';
  if (t >= at(g.prepareTime)) return 'prepare';
  return 'none';
}

/** 制限中（Level 1・Level 2）か。Sleep と Night Guard の設定は、この間は変更できない */
export const isGuardLocked = (stage: GuardStage): boolean => stage === 'soft' || stage === 'hard';

/** 再生リストの URL でも ID でも受け取り、ID にする */
export function normalizePlaylist(input: string): string {
  const t = input.trim();
  if (!t) return '';
  try {
    const list = new URL(t).searchParams.get('list');
    if (list) return list;
  } catch {
    // URL ではない → ID として扱う
  }
  return t;
}
