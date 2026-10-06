import { formatClock } from '@/lib/jst';
import { dueMessage, formatDuration } from '@/lib/messages';
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
  lines.push(`📱 昨夜のDigital（23:30以降） Mac ${d.mac.minutes}分 / iPhone ${d.iphone.minutes}分 / 一時解除 ${d.unlocks}回`);
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
