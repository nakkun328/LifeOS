import { DEFAULT_CONFIG } from './config';
import type { Ctx } from './context';
import { MemoryDb } from './memoryDb';

export const jst = (s: string) => new Date(`${s}+09:00`);
export const iso = (s: string) => jst(s).toISOString();

export function makeTestCtx(now = '2026-10-06T12:00:00', db = new MemoryDb()): Ctx & { db: MemoryDb } {
  return { db, now: jst(now), config: DEFAULT_CONFIG };
}

export const at = (ctx: Ctx, now: string): Ctx => ({ ...ctx, now: jst(now) });
