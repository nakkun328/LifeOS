import { parseHm } from './time';
import type { Settings, Stage } from './types';

export const DEFAULT_SETTINGS: Settings = {
  prepareTime: '22:45',
  softTime: '23:15',
  hardTime: '23:30',
  releaseTime: '06:00',
  wakeTime: '06:00',
  waitSeconds: 30,
  unlockMinutes: 10,
  allowedPlaylists: [],
};

const DAY = 1440;

/** 自動解除時刻を 0 とした「夜の経過分」。日付またぎをここで吸収する */
export function minutesSinceRelease(minutes: number, releaseMinutes: number): number {
  return (((minutes - releaseMinutes) % DAY) + DAY) % DAY;
}

/** 問題がなければ空配列 */
export function validateSettings(s: Settings): string[] {
  const errors: string[] = [];
  const times: Array<[string, string]> = [
    ['寝る準備', s.prepareTime],
    ['Shorts・X・Instagramの制限', s.softTime],
    ['YouTube全体の制限', s.hardTime],
    ['自動解除', s.releaseTime],
    ['起床', s.wakeTime],
  ];
  for (const [label, value] of times) {
    if (parseHm(value) === null) errors.push(`${label}の時刻が正しくありません`);
  }
  if (errors.length === 0) {
    const rel = parseHm(s.releaseTime)!;
    const p = minutesSinceRelease(parseHm(s.prepareTime)!, rel);
    const so = minutesSinceRelease(parseHm(s.softTime)!, rel);
    const h = minutesSinceRelease(parseHm(s.hardTime)!, rel);
    if (p === 0 || so === 0 || h === 0) {
      errors.push('各段階の時刻は、自動解除の時刻と別にしてください');
    } else if (!(p < so && so < h)) {
      errors.push('時刻は「寝る準備 → 制限 → YouTube全体の制限」の順にしてください');
    }
  }
  if (!Number.isInteger(s.waitSeconds) || s.waitSeconds < 0 || s.waitSeconds > 600) {
    errors.push('待ち時間は 0〜600 秒の整数にしてください');
  }
  if (!Number.isInteger(s.unlockMinutes) || s.unlockMinutes < 1 || s.unlockMinutes > 180) {
    errors.push('解除時間は 1〜180 分の整数にしてください');
  }
  return errors;
}

/** 保存値と初期値を合成。不正なら初期値に戻す（壊れた設定で拡張が止まらないように） */
export function mergeSettings(partial: Partial<Settings> | undefined): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...partial };
  if (!Array.isArray(merged.allowedPlaylists)) merged.allowedPlaylists = [];
  return validateSettings(merged).length === 0 ? merged : { ...DEFAULT_SETTINGS };
}

/** 制限中は設定を編集させない */
export function isEditLocked(stage: Stage): boolean {
  return stage === 'soft' || stage === 'hard';
}
