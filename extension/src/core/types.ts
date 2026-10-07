export type Site = 'youtube' | 'x' | 'instagram' | 'tiktok';
export type Stage = 'none' | 'prepare' | 'soft' | 'hard';

export type Settings = {
  /** すべて "HH:MM"（24時間表記） */
  prepareTime: string;
  softTime: string;
  hardTime: string;
  releaseTime: string;
  wakeTime: string;
  waitSeconds: number;
  unlockMinutes: number;
  /** 許可する再生リストID（URLの list= の値） */
  allowedPlaylists: string[];
};

/** サイト別の一時解除期限（epoch ms） */
export type Unlocks = Partial<Record<Site, number>>;

/** 制限対象として分類されたページ */
export type Target = { site: Site; isShorts: boolean };

export type EventKind = 'blocked' | 'unlocked';

export type GuardEvent = {
  /** 送信時の重複排除用。Phase 2 以降に記録したものにだけ付く */
  id?: string;
  /** ISO 8601 */
  at: string;
  kind: EventKind;
  site: Site;
  /** 解除理由（kind が unlocked のときのみ） */
  reason?: string;
};
