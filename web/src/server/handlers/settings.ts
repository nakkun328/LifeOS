import {
  DEFAULT_APP_SETTINGS,
  getGuardStage,
  isGuardLocked,
  mergeAppSettings,
  normalizePlaylist,
  validateAppSettings,
  type AppSettings,
  type GuardStage,
} from '@/lib/appSettings';
import type { Ctx } from '../context';
import { asObject, badRequest, forbidden } from '../errors';

const KEY = 'main';

type SettingsRow = { key: string; value: unknown };

/** 保存済みの設定（なければ初期値）。Settings の値が、Web・拡張・Discord の唯一の正 */
export async function getAppSettings(ctx: Ctx): Promise<AppSettings> {
  const [row] = await ctx.db.select<SettingsRow>('settings', { eq: { key: KEY }, limit: 1 });
  return mergeAppSettings(row?.value);
}

export type SettingsView = {
  settings: AppSettings;
  stage: GuardStage;
  /** 制限中。Sleep と Night Guard の設定は変更できない */
  locked: boolean;
  now: string;
};

export async function getSettingsView(ctx: Ctx): Promise<SettingsView> {
  const settings = await getAppSettings(ctx);
  const stage = getGuardStage(settings.guard, ctx.now);
  return { settings, stage, locked: isGuardLocked(stage), now: ctx.now.toISOString() };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 入力（再生リストは URL でも ID でも）を整える */
function normalizeInput(body: Record<string, unknown>): Record<string, unknown> {
  const guard = body.guard;
  if (typeof guard === 'object' && guard !== null && Array.isArray((guard as { allowedPlaylists?: unknown }).allowedPlaylists)) {
    const list = (guard as { allowedPlaylists: unknown[] }).allowedPlaylists;
    return {
      ...body,
      guard: {
        ...guard,
        allowedPlaylists: [...new Set(list.filter((x): x is string => typeof x === 'string').map(normalizePlaylist).filter(Boolean))],
      },
    };
  }
  return body;
}

/**
 * 設定を保存する。送られた節（sleep / guard / digital）だけを上書きする。
 * 制限中（Level 1・Level 2）は、Sleep と Night Guard の設定を変えられない（画面だけでなく、ここでも拒否する）。
 * 判定は「保存済みの設定 × 現在時刻」で行う（送られた値では判定しない）。
 */
export async function updateAppSettings(ctx: Ctx, body: unknown): Promise<SettingsView> {
  const input = normalizeInput(asObject(body));
  const current = await getAppSettings(ctx);

  const merged = {
    sleep: { ...current.sleep, ...(asObject(input.sleep ?? {})) },
    guard: { ...current.guard, ...(asObject(input.guard ?? {})) },
    digital: { ...current.digital, ...(asObject(input.digital ?? {})) },
  };
  const next = mergeAppSettings(merged, DEFAULT_APP_SETTINGS);

  // mergeAppSettings は、検証に通らない節を初期値に戻してしまう。保存前に、入力そのものを検証する
  const errors = validateAppSettings(strictParse(merged));
  if (errors.length > 0) throw badRequest(errors.join('\n'));

  const changesNightRules = !same(next.sleep, current.sleep) || !same(next.guard, current.guard);
  if (changesNightRules && isGuardLocked(getGuardStage(current.guard, ctx.now))) {
    throw forbidden('Night Guard の制限中は、Sleep と Night Guard の設定を変更できません。朝の自動解除のあとに変更してください。');
  }

  await ctx.db.upsert('settings', [{ key: KEY, value: next, updated_at: ctx.now.toISOString() }], { onConflict: 'key' });
  return getSettingsView(ctx);
}

/** 型だけ整える（値の補正や初期値への置き換えはしない。検証で弾くため） */
function strictParse(m: { sleep: Record<string, unknown>; guard: Record<string, unknown>; digital: Record<string, unknown> }): AppSettings {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : []);
  return {
    sleep: { targetBed: String(m.sleep.targetBed ?? ''), wakeTime: String(m.sleep.wakeTime ?? '') },
    guard: {
      prepareTime: String(m.guard.prepareTime ?? ''),
      level1Time: String(m.guard.level1Time ?? ''),
      level2Time: String(m.guard.level2Time ?? ''),
      releaseTime: String(m.guard.releaseTime ?? ''),
      waitSeconds: Number(m.guard.waitSeconds),
      unlockMinutes: Number(m.guard.unlockMinutes),
      allowedPlaylists: list(m.guard.allowedPlaylists),
    },
    digital: { reduce: list(m.digital.reduce).map((x) => x.toLowerCase()), exclude: list(m.digital.exclude).map((x) => x.toLowerCase()) },
  };
}
