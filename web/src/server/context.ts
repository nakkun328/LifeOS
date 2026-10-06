import type { Config } from './config';
import type { Db } from './db';

/** ハンドラに渡すもの。now を差し込めるので時間依存のテストができる */
export type Ctx = { db: Db; now: Date; config: Config };
