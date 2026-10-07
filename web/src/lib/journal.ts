// 日記の自動生成（純粋関数）。外部の AI は使わず、その日のデータをテンプレートで文にする。
// データがない項目の文は出さない。「日記」タグのログは、自由メモとしてそのまま本文に入れる。
import { formatMinutes } from './messages';
import { MOTIV_ITEMS, type MotivRecord } from './motivation';
import type { LogTag } from './types';

export type JournalInput = {
  /** その日の途中か（当日分）。途中のデータを、前日の1日ぶんと比べないために使う */
  inProgress: boolean;
  study: Array<{ name: string; minutes: number }>;
  clubMinutes: number;
  tasksDone: string[];
  /** Digital の、減らしたい時間。データがなければ null */
  digital: { minutes: number; diffMinutes: number | null } | null;
  /** 就寝（その日の夜）。比べる前日の夜があれば bedDiffMinutes（負なら早い） */
  sleep: { bed: string; bedDiffMinutes: number | null; durationMin: number | null } | null;
  /** その日のモチベ。未記録なら null / 省略 */
  motivation?: Pick<MotivRecord, 'scores' | 'comment'> | null;
  logs: Array<{ tag: LogTag; body: string }>;
  decisions: Array<{ title: string | null; body: string }>;
};

const MAX_SUBJECTS = 4;
const MAX_TASKS = 3;

const ENDINGS = '。.!！?？」）)';
const stop = (s: string): string => (ENDINGS.includes(s.slice(-1)) ? s : `${s}。`);

function studySentence(study: JournalInput['study']): string | null {
  const rows = study.filter((s) => Math.round(s.minutes) >= 1).sort((a, b) => b.minutes - a.minutes);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, MAX_SUBJECTS).map((s) => `${s.name}を${formatMinutes(s.minutes)}`);
  const rest = rows.length - MAX_SUBJECTS;
  return `今日は${shown.join('、')}${rest > 0 ? `、ほか${rest}科目も` : ''}勉強した。`;
}

function tasksSentence(done: string[]): string | null {
  if (done.length === 0) return null;
  const shown = done.slice(0, MAX_TASKS).map((t) => `「${t}」`).join('');
  const rest = done.length - MAX_TASKS;
  return `課題${shown}${rest > 0 ? `ほか${rest}件` : ''}を終えた。`;
}

/** 比べるのは過去の自分。増減は、評価の言葉を付けずに、事実として書く */
function digitalSentence(d: JournalInput['digital'], inProgress: boolean): string | null {
  if (!d) return null;
  if (inProgress || d.diffMinutes === null) return `${inProgress ? 'ここまでの' : ''}SNSなどの利用時間は${formatMinutes(d.minutes)}だった。`;
  const m = Math.abs(Math.round(d.diffMinutes));
  if (m === 0) return 'SNSなどの利用時間は昨日と同じだった。';
  return `SNSなどの利用時間は昨日より${formatMinutes(m)}${d.diffMinutes < 0 ? '短かった' : '長かった'}。`;
}

function sleepSentences(s: JournalInput['sleep']): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.bedDiffMinutes === null) out.push(`就寝は${s.bed}だった。`);
  else {
    const m = Math.abs(Math.round(s.bedDiffMinutes));
    out.push(m === 0 ? '就寝は昨日と同じ時刻だった。' : `就寝は昨日より${formatMinutes(m)}${s.bedDiffMinutes < 0 ? '早かった' : '遅かった'}。`);
  }
  if (s.durationMin !== null && s.durationMin > 0) out.push(`睡眠は${formatMinutes(s.durationMin)}だった。`);
  return out;
}

/** その日のモチベを1行で。記録した項目だけ（欠けは欠けのまま） */
function motivationSentence(m: JournalInput['motivation']): string | null {
  if (!m) return null;
  const parts = MOTIV_ITEMS.filter((i) => m.scores[i.key] !== undefined).map((i) => `${i.label}${m.scores[i.key]}`);
  if (parts.length === 0) return null;
  return `モチベーションは ${parts.join('・')} だった${m.comment ? `（一言：${m.comment.replace(/[。.!！?？]$/, '')}）` : ''}。`;
}

export function composeJournal(input: JournalInput): { body: string; hasData: boolean } {
  const lines: string[] = [];
  const push = (s: string | null) => s && lines.push(s);

  push(studySentence(input.study));
  if (Math.round(input.clubMinutes) >= 1) lines.push(`部活に${formatMinutes(input.clubMinutes)}取り組んだ。`);
  push(tasksSentence(input.tasksDone));
  push(digitalSentence(input.digital, input.inProgress));
  for (const s of sleepSentences(input.sleep)) lines.push(s);
  push(motivationSentence(input.motivation));
  for (const l of input.logs.filter((x) => x.tag !== '日記')) lines.push(stop(`${l.tag}：${l.body}`));
  for (const d of input.decisions) lines.push(stop(`部活の決定事項：${d.title ? `（${d.title}）` : ''}${d.body}`));
  // 「日記」タグは、自由メモ。そのまま（加工せずに）入れる
  for (const l of input.logs.filter((x) => x.tag === '日記')) lines.push(l.body);

  return { body: lines.join('\n'), hasData: lines.length > 0 };
}

/** 前日分は、日が変わって（朝6時）から、この時刻まではデータを取り込み直し、そのあと確定する */
export const SETTLE_HOUR_JST = 12;
