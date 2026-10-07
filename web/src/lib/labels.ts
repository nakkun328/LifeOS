const SERVICE_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  youtube_shorts: 'Shorts',
  youtube_music: '音楽・BGM',
  x: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

/** 利用時間のカテゴリ（iPhone はアプリ名）を表示名にする。知らない名前はそのまま */
export const serviceLabel = (c: string): string => SERVICE_LABEL[c] ?? c;
