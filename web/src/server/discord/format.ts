import { formatClock } from '@/lib/jst';
import { formatDelta } from '@/lib/digital';
import { dueMessage, formatDuration } from '@/lib/messages';
import type { TaskView } from '../handlers/tasks';
import type { WordsSummary } from '@/lib/words';
import type { WeekView } from '../handlers/week';
import type { TodayView } from '../handlers/today';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const dowOf = (date: string) => DOW[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** Discord に出す Today。責めずに、改善量で伝える */
export function formatToday(v: TodayView): string {
  const lines: string[] = ['**📅 Today**'];
  if (v.active) {
    const mins = (Date.parse(v.now) - Date.parse(v.active.started_at)) / 1000;
    lines.push(`⏱ 計測中：${v.active.kind === 'club' ? '部活' : (v.active.subject_name ?? '勉強')}（${formatDuration(mins)}）`);
  }
  lines.push(`📚 勉強 ${formatDuration(v.study.todaySeconds)}（今週 ${formatDuration(v.study.weekSeconds)}）`);
  if (v.club.todaySeconds > 0 || v.club.weekSeconds > 0) {
    lines.push(`🏃 部活 ${formatDuration(v.club.todaySeconds)}（今週 ${formatDuration(v.club.weekSeconds)}）`);
  }
  const s = v.sleep;
  if (s.lastNight) {
    const diff = s.diffMessage ? `　${s.diffMessage}` : '';
    lines.push(`🌙 昨夜の就寝 ${formatClock(new Date(s.lastNight.sleep_at))}${diff}`);
  } else {
    lines.push('🌙 就寝の記録はまだありません');
  }
  if (s.weekdayAvgBed) lines.push(`　平日の平均就寝 ${s.weekdayAvgBed}`);
  const d = v.digital;
  const delta = d.day.diffMinutes === null ? '' : `（昨日より${formatDelta(d.day.diffMinutes)}）`;
  lines.push(`📱 昨日のDigital ${d.day.minutes}分${delta}`);
  lines.push(`　昨夜（23:30以降） Mac ${d.night.mac.minutes}分 / iPhone ${d.night.iphone.minutes}分 / 一時解除 ${d.night.unlocks}回`);
  if (v.tasks.length > 0) {
    lines.push('📝 課題');
    for (const t of v.tasks) lines.push(`　・${t.title}　${dueMessage(t.days_left)}`);
  }
  if (v.logsToday.length > 0) {
    lines.push('💬 今日のログ');
    for (const l of v.logsToday.slice(0, 5)) lines.push(`　・[${l.tag}] ${l.body}`);
  }
  return lines.join('\n').slice(0, 1900);
}

export function formatWeek(w: WeekView): string {
  const lines: string[] = [`**🗓 今週（${md(w.weekStart)}〜）**`];
  lines.push(`📚 勉強 合計 ${formatDuration(w.studySeconds)}`);
  for (const d of w.days) lines.push(`　${md(d.date)}(${dowOf(d.date)}) ${formatDuration(d.studySeconds)}`);
  if (w.clubSeconds > 0) lines.push(`🏃 部活 合計 ${formatDuration(w.clubSeconds)}`);
  if (w.nights.length > 0) {
    lines.push('🌙 就寝');
    for (const n of w.nights) lines.push(`　${md(n.night_date)}(${dowOf(n.night_date)}) ${n.bed}`);
  }
  if (w.weekdayAvgBed) lines.push(`　平日の平均就寝 ${w.weekdayAvgBed}`);
  if (w.digital.length > 0) {
    lines.push('📱 夜のDigital（23:30以降） Mac / iPhone');
    for (const g of w.digital) lines.push(`　${md(g.night_date)}(${dowOf(g.night_date)}) ${g.macMinutes}分 / ${g.iphoneMinutes}分`);
  }
  return lines.join('\n').slice(0, 1900);
}

/** 期限が近い課題の一覧（/tasks） */
export function formatTasks(tasks: TaskView[]): string {
  if (tasks.length === 0) return '**📝 課題**\n期限が近い課題はありません。';
  const CAT = { school: '学校', club: '部活', personal: '個人' } as const;
  const lines = ['**📝 課題（期限の近い順）**'];
  for (const t of tasks) {
    const meta = [t.category ? CAT[t.category] : null, t.subject_name].filter(Boolean).join('・');
    const status = t.status === 'doing' ? '［途中］' : '';
    lines.push(`・${t.title}${status}　${dueMessage(t.days_left)}（${t.due_date}）${meta ? `　${meta}` : ''}`);
  }
  return lines.join('\n').slice(0, 1900);
}

/** 今日の復習の件数と、テストまでの日数（/words） */
export function formatWords(w: WordsSummary): string {
  if (w.total === 0) return '**📖 英単語**\nまだ単語がありません。Web の Study > 英単語 から登録できます。';
  const lines = ['**📖 英単語**', `今日の復習 ${w.dueCount}語`];
  if (w.nextTest) {
    const left = w.nextTest.days_left === 0 ? '今日' : `あと${w.nextTest.days_left}日`;
    lines.push(`${w.nextTest.name}　${left}・未習得 ${w.nextTest.unmastered}語`);
  }
  if (w.counts.weak > 0) lines.push(`苦手な単語 ${w.counts.weak}語`);
  return lines.join('\n');
}

/** 今日の日記（/journal）。Discord の本文は 2000 文字までなので、余裕をもって切る */
export function formatJournal(j: { date: string; body: string }): string {
  const head = `**📝 日記 ${j.date}**`;
  if (!j.body.trim()) return `${head}\nまだ記録がありません。勉強やログを残すと、日記ができます。`;
  const body = j.body.length > 1800 ? `${j.body.slice(0, 1800)}…` : j.body;
  return `${head}\n${body}`;
}
