// Insights の集計（すべて純粋関数）。たまったデータを横断して、傾向を文にする。
// 方針：件数が少ないうちは結論を出さず「あと◯件」を返す。相関を因果として言い切らない（「〜の傾向があります」）。
// 比べる相手は過去の自分。評価の言葉（良い・悪い・サボり…）は使わない。
import { addDays, dayOfWeek, formatBedMinutes, weekStartKey } from './jst';
import { formatDurationDelta, formatMinutes } from './messages';

/** 結論を出すのに必要な最低件数。DECISIONS.md にも同じ値を記録している */
export const MIN = {
  /** 今週・先週のそれぞれで、データのある日（夜）の数 */
  weekDays: 2,
  /** 科目×時間帯・科目×長さ：1つの区分に必要なセッション数 */
  groupSessions: 3,
  /** 科目×時間帯・科目×長さ：その科目の効率つきセッションの合計 */
  subjectSessions: 6,
  /** 科目×時間帯・科目×長さ：比べるのに必要な（件数を満たした）区分の数 */
  groups: 2,
  /** 睡眠×Digital、就寝×翌日の勉強：組になる日数（半分ずつに分けるので、各5日以上） */
  pairs: 10,
  /** 翌日の勉強の効率を出すのに、半分ごとに必要な効率つきセッション数 */
  nextDayEfficiency: 5,
  /** 曜日とモチベ：1つの曜日に必要な記録日数 */
  weekdayRecords: 3,
  /** 曜日とモチベ：比べるのに必要な（件数を満たした）曜日の数 */
  weekdays: 2,
};
/** モチベ（1〜10 の平均）の差が、これ未満なら「ほとんど差はない」とする */
export const MIN_MOTIVATION_GAP = 0.5;
/** 平均効率（1〜5）の差が、これ未満なら「大きな差はない」とする */
export const MIN_EFFICIENCY_GAP = 0.3;
/** 就寝・勉強などの差が、これ未満（分）なら「ほとんど差はない」とする */
export const NEGLIGIBLE_MIN = 5;

export type DayFacts = {
  date: string;
  /** その日の勉強（分）。今日は途中まで */
  studyMin: number;
  /** その日の「減らしたい時間」（分）。利用データがない日・まだ終わっていない日は null */
  digitalMin: number | null;
  /** その夜の就寝（正午起点の分）。記録がなければ null */
  bedMin: number | null;
  /** その夜の睡眠時間（分）。起床の記録がなければ null */
  sleepMin: number | null;
  /** 日が終わっているか */
  complete: boolean;
  /** その日のモチベ（記録した項目の平均、1〜10）。未記録なら null / 省略 */
  motivation?: number | null;
};

export type EffSession = { subject: string; date: string; startHour: number; minutes: number; efficiency: number };

/** 結論の1行。n は、もとにした件数 */
export type Line = { key: string; text: string; n: number; unit: string; /** 0〜1。Today に出す1件を選ぶのに使う */ score: number };
/** 件数が足りない項目。remaining 件たまると表示される */
export type Pending = { key: string; label: string; have: number; need: number; remaining: number; unit: string };
export type Section = { lines: Line[]; pending: Pending[] };

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const round1 = (x: number): string => (Math.round(x * 10) / 10).toFixed(1);
const pending = (key: string, label: string, have: number, need: number, unit: string): Pending => ({ key, label, have, need, remaining: Math.max(0, need - have), unit });

// ---- 今週と先週 ----

export type WeekMetric = {
  key: 'study' | 'digital' | 'bed' | 'sleep';
  /** 今週・先週のうち少ないほうの、データのある日（夜）の数 */
  have: number;
  ready: boolean;
  thisValue: number | null;
  lastValue: number | null;
  /** 今週 − 先週。study は秒、digital・sleep は分、bed は分（負なら早い） */
  diff: number | null;
};

/**
 * 今週（月曜〜今日）と、先週の同じ時点までの比較。
 *  - studyCompare：今週ここまでと、先週の同じ時点までの勉強の秒数（週の途中で先週の1週間ぶんと比べないため）
 *  - Digital：両方の週に利用データがある「同じ曜日」の組だけを足す（記録のない日が片方にあっても偏らないように）
 *  - 就寝・睡眠：記録のある夜の平均どうし
 */
export function weekComparison(days: DayFacts[], studyCompare: { thisSeconds: number; lastSeconds: number }, todayKey: string): WeekMetric[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const thisStart = weekStartKey(todayKey);
  const span = Array.from({ length: daysBetween(thisStart, todayKey) + 1 }, (_, i) => i);
  const thisDays = span.map((i) => byDate.get(addDays(thisStart, i)));
  const lastDays = span.map((i) => byDate.get(addDays(thisStart, i - 7)));

  const studyThis = thisDays.filter((d) => d && d.studyMin > 0).length;
  const studyLast = lastDays.filter((d) => d && d.studyMin > 0).length;
  const study: WeekMetric = {
    key: 'study',
    have: Math.min(studyThis, studyLast),
    ready: Math.min(studyThis, studyLast) >= MIN.weekDays,
    thisValue: studyCompare.thisSeconds,
    lastValue: studyCompare.lastSeconds,
    diff: Math.min(studyThis, studyLast) >= MIN.weekDays ? studyCompare.thisSeconds - studyCompare.lastSeconds : null,
  };

  const pairs = span
    .map((i) => [thisDays[i], lastDays[i]] as const)
    .filter((p): p is readonly [DayFacts, DayFacts] => !!p[0] && !!p[1] && p[0].digitalMin !== null && p[1].digitalMin !== null);
  const digitalThis = sum(pairs.map(([a]) => a.digitalMin ?? 0));
  const digitalLast = sum(pairs.map(([, b]) => b.digitalMin ?? 0));
  const digital: WeekMetric = {
    key: 'digital',
    have: pairs.length,
    ready: pairs.length >= MIN.weekDays,
    thisValue: pairs.length ? digitalThis : null,
    lastValue: pairs.length ? digitalLast : null,
    diff: pairs.length >= MIN.weekDays ? digitalThis - digitalLast : null,
  };

  const meanMetric = (key: 'bed' | 'sleep', pick: (d: DayFacts) => number | null): WeekMetric => {
    const a = thisDays.map((d) => (d ? pick(d) : null)).filter((x): x is number => x !== null);
    const b = lastDays.map((d) => (d ? pick(d) : null)).filter((x): x is number => x !== null);
    const have = Math.min(a.length, b.length);
    const ready = have >= MIN.weekDays;
    const [x, y] = [avg(a), avg(b)];
    return { key, have, ready, thisValue: x, lastValue: y, diff: ready && x !== null && y !== null ? x - y : null };
  };

  return [study, digital, meanMetric('bed', (d) => d.bedMin), meanMetric('sleep', (d) => d.sleepMin)];
}

function daysBetween(from: string, to: string): number {
  const t = (k: string) => Date.parse(`${k}T00:00:00Z`);
  return Math.round((t(to) - t(from)) / 86_400_000);
}

const WEEK_LABEL: Record<WeekMetric['key'], string> = { study: '勉強', digital: 'Digital', bed: '平均就寝', sleep: '平均睡眠' };

/** 今週と先週の差を、数字を中心に1行ずつ。Digital は「減らしたい時間」 */
export function weekLines(metrics: WeekMetric[]): Section {
  const lines: Line[] = [];
  const pend: Pending[] = [];
  for (const m of metrics) {
    const label = WEEK_LABEL[m.key];
    if (!m.ready || m.diff === null || m.thisValue === null || m.lastValue === null) {
      pend.push(pending(`week-${m.key}`, `${label}の先週との比較`, m.have, MIN.weekDays, '日分'));
      continue;
    }
    if (m.key === 'study') {
      lines.push({ key: 'week-study', text: `勉強は先週の同じ時点より ${formatDurationDelta(m.diff)}（今週 ${formatMinutes(m.thisValue / 60)}、先週 ${formatMinutes(m.lastValue / 60)}）`, n: m.have, unit: '日', score: clamp01(Math.abs(m.diff) / Math.max(m.lastValue, 1800)) });
    } else if (m.key === 'digital') {
      lines.push({ key: 'week-digital', text: `Digital（減らしたい時間）は先週の同じ曜日より ${formatDurationDelta(m.diff * 60)}（今週 ${formatMinutes(m.thisValue)}、先週 ${formatMinutes(m.lastValue)}）`, n: m.have, unit: '日', score: clamp01(Math.abs(m.diff) / Math.max(m.lastValue, 30)) });
    } else if (m.key === 'bed') {
      const d = Math.round(Math.abs(m.diff));
      const msg = d === 0 ? '先週と同じ' : `先週より${d}分${m.diff < 0 ? '早い' : '遅め'}`;
      lines.push({ key: 'week-bed', text: `平均就寝は ${formatBedMinutes(m.thisValue)}（${msg}、先週 ${formatBedMinutes(m.lastValue)}）`, n: m.have, unit: '夜', score: clamp01(Math.abs(m.diff) / 60) });
    } else {
      const d = Math.round(Math.abs(m.diff));
      const msg = d === 0 ? '先週と同じ' : `先週より${formatMinutes(d)}${m.diff > 0 ? '長い' : '短め'}`;
      lines.push({ key: 'week-sleep', text: `平均睡眠は ${formatMinutes(m.thisValue)}（${msg}、先週 ${formatMinutes(m.lastValue)}）`, n: m.have, unit: '夜', score: clamp01(Math.abs(m.diff) / 60) });
    }
  }
  return { lines, pending: pend };
}

/** 例：「今週は先週より Study +1時間48分、Digital −2時間12分」。勉強と Digital のどちらかが出せるときだけ */
export function weekHeadline(metrics: WeekMetric[]): string | null {
  const parts: string[] = [];
  const s = metrics.find((m) => m.key === 'study');
  const d = metrics.find((m) => m.key === 'digital');
  if (s?.ready && s.diff !== null) parts.push(`Study ${formatDurationDelta(s.diff)}`);
  if (d?.ready && d.diff !== null) parts.push(`Digital ${formatDurationDelta(d.diff * 60)}`);
  return parts.length ? `今週は先週より ${parts.join('、')}` : null;
}

// ---- 勉強：科目 × 時間帯、科目 × セッションの長さ ----

type Group = { id: string; label: string };

/** 開始時刻の時間帯（JST の時）。例の「19〜21時」に合わせて、夕方〜夜を細かく分ける */
export const TIME_BANDS: Array<Group & { from: number; to: number }> = [
  { id: 'night', label: '0〜6時', from: 0, to: 6 },
  { id: 'morning', label: '6〜10時', from: 6, to: 10 },
  { id: 'daytime', label: '10〜14時', from: 10, to: 14 },
  { id: 'afternoon', label: '14〜17時', from: 14, to: 17 },
  { id: 'evening', label: '17〜19時', from: 17, to: 19 },
  { id: 'prime', label: '19〜21時', from: 19, to: 21 },
  { id: 'late', label: '21〜24時', from: 21, to: 24 },
];
export const bandOf = (hour: number): Group => TIME_BANDS.find((b) => hour >= b.from && hour < b.to) ?? TIME_BANDS[0]!;

/** セッションの長さ（分） */
export const LENGTHS: Array<Group & { from: number; to: number }> = [
  { id: 'l15', label: '〜15分', from: 0, to: 15 },
  { id: 'l30', label: '15〜30分', from: 15, to: 30 },
  { id: 'l45', label: '30〜45分', from: 30, to: 45 },
  { id: 'l60', label: '45〜60分', from: 45, to: 60 },
  { id: 'l90', label: '60〜90分', from: 60, to: 90 },
  { id: 'l90p', label: '90分〜', from: 90, to: Infinity },
];
export const lengthOf = (minutes: number): Group => LENGTHS.find((b) => minutes >= b.from && minutes < b.to) ?? LENGTHS[0]!;

type GroupStat = { id: string; label: string; n: number; avg: number };

/** 科目ごとに、区分（時間帯・長さ）別の平均効率を出し、いちばん高い区分を返す */
export function efficiencyBy(sessions: EffSession[], groupOf: (s: EffSession) => Group, kind: 'band' | 'length'): Section {
  const bySubject = new Map<string, EffSession[]>();
  for (const s of sessions) bySubject.set(s.subject, [...(bySubject.get(s.subject) ?? []), s]);

  const lines: Line[] = [];
  const pend: Pending[] = [];
  const what = kind === 'band' ? '時間帯ごとの平均効率' : 'セッションの長さと効率';
  for (const [subject, rows] of [...bySubject.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const groups = new Map<string, { label: string; xs: number[] }>();
    for (const s of rows) {
      const g = groupOf(s);
      const cur = groups.get(g.id) ?? { label: g.label, xs: [] };
      cur.xs.push(s.efficiency);
      groups.set(g.id, cur);
    }
    const all: GroupStat[] = [...groups.entries()].map(([id, g]) => ({ id, label: g.label, n: g.xs.length, avg: avg(g.xs)! }));
    const enough = all.filter((g) => g.n >= MIN.groupSessions);
    if (rows.length >= MIN.subjectSessions && enough.length >= MIN.groups) {
      const sorted = [...enough].sort((a, b) => b.avg - a.avg || b.n - a.n);
      const best = sorted[0]!;
      const worst = sorted[sorted.length - 1]!;
      const gap = best.avg - worst.avg;
      const used = sum(enough.map((g) => g.n));
      if (gap < MIN_EFFICIENCY_GAP) {
        lines.push({ key: `${kind}-${subject}`, text: `${subject}は、${what}に大きな差は見られません（平均 ${round1(worst.avg)}〜${round1(best.avg)}）`, n: used, unit: '件', score: 0 });
      } else {
        const text =
          kind === 'band'
            ? `${subject}は${best.label}の平均効率が最も高い傾向があります（平均 ${round1(best.avg)}、${best.n}件。いちばん低い${worst.label}は ${round1(worst.avg)}）`
            : `${subject}は${best.label}のセッションで効率が高い傾向があります（平均 ${round1(best.avg)}、${best.n}件。いちばん低い${worst.label}は ${round1(worst.avg)}）`;
        lines.push({ key: `${kind}-${subject}`, text, n: used, unit: '件', score: clamp01(gap / 4) });
      }
    } else {
      // あと何件で出るか：区分の件数を満たすのに最低限いる分と、科目の合計のうち、大きいほう
      const top2 = [...all].sort((a, b) => b.n - a.n).slice(0, MIN.groups);
      const forGroups = Array.from({ length: MIN.groups }, (_, i) => Math.max(0, MIN.groupSessions - (top2[i]?.n ?? 0))).reduce((a, b) => a + b, 0);
      const remaining = Math.max(MIN.subjectSessions - rows.length, forGroups);
      pend.push({ key: `${kind}-${subject}`, label: `${subject}の${what}`, have: rows.length, need: rows.length + remaining, remaining, unit: '件' });
    }
  }
  if (bySubject.size === 0) pend.push(pending(`${kind}-all`, `科目ごとの${what}（終了時に効率を入れた勉強）`, 0, MIN.subjectSessions, '件'));
  return { lines, pending: pend.sort((a, b) => a.remaining - b.remaining) };
}

export const efficiencyByBand = (sessions: EffSession[]): Section => efficiencyBy(sessions, (s) => bandOf(s.startHour), 'band');
export const efficiencyByLength = (sessions: EffSession[]): Section => efficiencyBy(sessions, (s) => lengthOf(s.minutes), 'length');

// ---- 睡眠と Digital ----

/** 値の小さい順に並べ、半分ずつ（奇数なら真ん中は除く）に分ける */
function halves<T>(rows: T[], by: (r: T) => number): { low: T[]; high: T[] } {
  const sorted = [...rows].sort((a, b) => by(a) - by(b));
  const h = Math.floor(sorted.length / 2);
  return { low: sorted.slice(0, h), high: sorted.slice(sorted.length - h) };
}

/** Digital が短い日と長い日で、その夜の就寝時刻はどれだけ違うか（日が終わっていて、両方の記録がある日だけ） */
export function digitalVsBed(days: DayFacts[]): Section {
  const rows = days.filter((d) => d.complete && d.digitalMin !== null && d.bedMin !== null) as Array<DayFacts & { digitalMin: number; bedMin: number }>;
  if (rows.length < MIN.pairs) return { lines: [], pending: [pending('digital-bed', 'Digital の長さと就寝時刻', rows.length, MIN.pairs, '日分')] };
  const { low, high } = halves(rows, (r) => r.digitalMin);
  const shortBed = avg(low.map((r) => r.bedMin))!;
  const longBed = avg(high.map((r) => r.bedMin))!;
  const diff = longBed - shortBed; // 正なら、Digital が長い日のほうが遅い
  const shortMax = Math.max(...low.map((r) => r.digitalMin));
  const longMin = Math.min(...high.map((r) => r.digitalMin));
  const basis = `${rows.length}日分`;
  const text =
    Math.abs(diff) < NEGLIGIBLE_MIN
      ? `Digital が短い日（〜${formatMinutes(shortMax)}）と長い日（${formatMinutes(longMin)}〜）で、平均就寝時刻にほとんど差はありません（${basis}）`
      : `Digital が短い日（〜${formatMinutes(shortMax)}、平均就寝 ${formatBedMinutes(shortBed)}）は、長い日（${formatMinutes(longMin)}〜、${formatBedMinutes(longBed)}）より就寝が${Math.round(Math.abs(diff))}分${diff > 0 ? '早い' : '遅め'}傾向があります（${basis}）`;
  return { lines: [{ key: 'digital-bed', text, n: rows.length, unit: '日', score: Math.abs(diff) < NEGLIGIBLE_MIN ? 0 : clamp01(Math.abs(diff) / 60) }], pending: [] };
}

/** 就寝時刻と、翌日の勉強時間（と、あれば効率）。翌日が終わっている夜だけ */
export function bedVsNextDay(days: DayFacts[], sessions: EffSession[]): Section {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const rows: Array<{ bedMin: number; nextStudyMin: number; nextEff: number[] }> = [];
  for (const d of days) {
    const next = byDate.get(addDays(d.date, 1));
    if (d.bedMin === null || !next || !next.complete) continue;
    rows.push({ bedMin: d.bedMin, nextStudyMin: next.studyMin, nextEff: sessions.filter((s) => s.date === next.date).map((s) => s.efficiency) });
  }
  if (rows.length < MIN.pairs) return { lines: [], pending: [pending('bed-nextday', '就寝時刻と翌日の勉強', rows.length, MIN.pairs, '夜')] };

  const { low: early, high: late } = halves(rows, (r) => r.bedMin);
  const earlyBed = avg(early.map((r) => r.bedMin))!;
  const lateBed = avg(late.map((r) => r.bedMin))!;
  const earlyMax = Math.max(...early.map((r) => r.bedMin));
  const lateMin = Math.min(...late.map((r) => r.bedMin));
  const earlyStudy = avg(early.map((r) => r.nextStudyMin))!;
  const lateStudy = avg(late.map((r) => r.nextStudyMin))!;
  const diff = earlyStudy - lateStudy; // 正なら、早く寝た翌日のほうが長い
  const range = `早い夜（〜${formatBedMinutes(earlyMax)}）の翌日と、遅い夜（${formatBedMinutes(lateMin)}〜）の翌日`;
  const basis = `${rows.length}夜分`;
  const lines: Line[] = [
    {
      key: 'bed-nextday-study',
      text:
        Math.abs(diff) < NEGLIGIBLE_MIN
          ? `就寝が${range}で、勉強時間にほとんど差はありません（${basis}）`
          : `就寝が${range}を比べると、勉強時間は平均${formatMinutes(Math.abs(diff))}${diff > 0 ? '長い' : '短め'}傾向があります（${basis}。${formatMinutes(earlyStudy)} と ${formatMinutes(lateStudy)}）`,
      n: rows.length,
      unit: '夜',
      score: Math.abs(diff) < NEGLIGIBLE_MIN ? 0 : clamp01(Math.abs(diff) / 90),
    },
  ];
  const earlyEff = early.flatMap((r) => r.nextEff);
  const lateEff = late.flatMap((r) => r.nextEff);
  if (earlyEff.length >= MIN.nextDayEfficiency && lateEff.length >= MIN.nextDayEfficiency) {
    const e = avg(earlyEff)!;
    const l = avg(lateEff)!;
    lines.push({
      key: 'bed-nextday-eff',
      text:
        Math.abs(e - l) < MIN_EFFICIENCY_GAP
          ? `翌日の勉強の平均効率にも、大きな差は見られません（早い夜の翌日 ${round1(e)}、遅い夜の翌日 ${round1(l)}）`
          : `翌日の勉強の平均効率は、早い夜の翌日が ${round1(e)}、遅い夜の翌日が ${round1(l)} で、${e > l ? '早い夜の翌日' : '遅い夜の翌日'}のほうが高い傾向があります`,
      n: earlyEff.length + lateEff.length,
      unit: '件',
      score: Math.abs(e - l) < MIN_EFFICIENCY_GAP ? 0 : clamp01(Math.abs(e - l) / 4),
    });
  }
  return { lines, pending: earlyEff.length >= MIN.nextDayEfficiency && lateEff.length >= MIN.nextDayEfficiency ? [] : [pending('bed-nextday-eff', '就寝時刻と翌日の勉強の効率', Math.min(earlyEff.length, lateEff.length), MIN.nextDayEfficiency, '件')] };
}

// ---- モチベ ----

const DOW_NAME = ['日', '月', '火', '水', '木', '金', '土'];
const oneDecimal = (x: number): string => (Math.round(x * 10) / 10).toFixed(1);

/**
 * モチベ（記録した項目の平均）と、睡眠時間・Digital・曜日の関係。
 *  - 睡眠：その日のモチベと、その前の夜の睡眠時間（起床の記録がある夜）
 *  - Digital：その日のモチベと、その日の「減らしたい時間」（日が終わっている日）
 *  - 曜日：曜日ごとの平均
 * どれも「傾向」として書く（原因は言わない）。
 */
export function motivationInsights(days: DayFacts[]): Section {
  const lines: Line[] = [];
  const pend: Pending[] = [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const withM = days.filter((d): d is DayFacts & { motivation: number } => typeof d.motivation === 'number');

  // 睡眠時間 × モチベ
  const sleepRows = withM
    .map((d) => ({ m: d.motivation, x: byDate.get(addDays(d.date, -1))?.sleepMin ?? null }))
    .filter((r): r is { m: number; x: number } => r.x !== null);
  if (sleepRows.length < MIN.pairs) {
    pend.push(pending('motivation-sleep', '睡眠時間とモチベ', sleepRows.length, MIN.pairs, '日分'));
  } else {
    const { low, high } = halves(sleepRows, (r) => r.x);
    const [lm, hm] = [avg(low.map((r) => r.m))!, avg(high.map((r) => r.m))!];
    const diff = hm - lm;
    const range = `前の夜の睡眠が長い日（${formatMinutes(Math.min(...high.map((r) => r.x)))}〜）と、短い日（〜${formatMinutes(Math.max(...low.map((r) => r.x)))}）`;
    lines.push({
      key: 'motivation-sleep',
      text:
        Math.abs(diff) < MIN_MOTIVATION_GAP
          ? `${range}で、モチベの平均にほとんど差はありません（${sleepRows.length}日分）`
          : `${range}を比べると、モチベの平均は長い日が ${oneDecimal(hm)}、短い日が ${oneDecimal(lm)} で、睡眠が${diff > 0 ? '長い' : '短い'}日のほうが高い傾向があります（${sleepRows.length}日分）`,
      n: sleepRows.length,
      unit: '日',
      score: Math.abs(diff) < MIN_MOTIVATION_GAP ? 0 : clamp01(Math.abs(diff) / 5),
    });
  }

  // Digital × モチベ
  const digRows = withM.filter((d): d is DayFacts & { motivation: number; digitalMin: number } => d.complete && d.digitalMin !== null);
  if (digRows.length < MIN.pairs) {
    pend.push(pending('motivation-digital', 'Digital の長さとモチベ', digRows.length, MIN.pairs, '日分'));
  } else {
    const { low, high } = halves(digRows, (r) => r.digitalMin);
    const [sm, lm] = [avg(low.map((r) => r.motivation))!, avg(high.map((r) => r.motivation))!];
    const diff = sm - lm; // 正なら、Digital が短い日のほうが高い
    const range = `Digital が短い日（〜${formatMinutes(Math.max(...low.map((r) => r.digitalMin)))}）と、長い日（${formatMinutes(Math.min(...high.map((r) => r.digitalMin)))}〜）`;
    lines.push({
      key: 'motivation-digital',
      text:
        Math.abs(diff) < MIN_MOTIVATION_GAP
          ? `${range}で、モチベの平均にほとんど差はありません（${digRows.length}日分）`
          : `${range}を比べると、モチベの平均は短い日が ${oneDecimal(sm)}、長い日が ${oneDecimal(lm)} で、Digital が${diff > 0 ? '短い' : '長い'}日のほうが高い傾向があります（${digRows.length}日分）`,
      n: digRows.length,
      unit: '日',
      score: Math.abs(diff) < MIN_MOTIVATION_GAP ? 0 : clamp01(Math.abs(diff) / 5),
    });
  }

  // 曜日 × モチベ
  const byDow = new Map<number, number[]>();
  for (const d of withM) byDow.set(dayOfWeek(d.date), [...(byDow.get(dayOfWeek(d.date)) ?? []), d.motivation]);
  const dows = [...byDow.entries()].map(([dow, xs]) => ({ dow, n: xs.length, avg: avg(xs)! }));
  const enough = dows.filter((x) => x.n >= MIN.weekdayRecords);
  if (enough.length < MIN.weekdays) {
    const top = [...dows].sort((a, b) => b.n - a.n).slice(0, MIN.weekdays);
    const remaining = Array.from({ length: MIN.weekdays }, (_, i) => Math.max(0, MIN.weekdayRecords - (top[i]?.n ?? 0))).reduce((a, b) => a + b, 0);
    pend.push({ key: 'motivation-weekday', label: '曜日とモチベ', have: withM.length, need: withM.length + remaining, remaining, unit: '日分' });
  } else {
    const sorted = [...enough].sort((a, b) => b.avg - a.avg || b.n - a.n);
    const best = sorted[0]!;
    const worst = sorted[sorted.length - 1]!;
    const gap = best.avg - worst.avg;
    const used = enough.reduce((a, x) => a + x.n, 0);
    lines.push({
      key: 'motivation-weekday',
      text:
        gap < MIN_MOTIVATION_GAP
          ? `曜日によるモチベの大きな差は見られません（${used}日分）`
          : `曜日では、${DOW_NAME[best.dow]}曜日のモチベの平均が最も高く（${oneDecimal(best.avg)}、${best.n}日）、${DOW_NAME[worst.dow]}曜日が最も低め（${oneDecimal(worst.avg)}、${worst.n}日）の傾向があります`,
      n: used,
      unit: '日',
      score: gap < MIN_MOTIVATION_GAP ? 0 : clamp01(gap / 5),
    });
  }
  return { lines, pending: pend };
}

// ---- まとめ ----

export type InsightsResult = {
  week: Section & { headline: string | null };
  study: { band: Section; length: Section };
  sleep: { digitalBed: Section; bedNextDay: Section };
  motivation: Section;
  /** Today に出す、いちばん意味のある1件。なければ null */
  top: Line | null;
  /** top がないとき、いちばん近い（あと何件で）項目 */
  nearest: Pending | null;
};

export function pickTop(sections: Section[]): { top: Line | null; nearest: Pending | null } {
  const lines = sections.flatMap((s) => s.lines).filter((l) => l.score > 0);
  const top = lines.sort((a, b) => b.score - a.score)[0] ?? null;
  const nearest = sections.flatMap((s) => s.pending).filter((p) => p.remaining > 0).sort((a, b) => a.remaining - b.remaining)[0] ?? null;
  return { top, nearest };
}

export function buildInsights(input: { days: DayFacts[]; sessions: EffSession[]; studyCompare: { thisSeconds: number; lastSeconds: number }; todayKey: string }): InsightsResult {
  const metrics = weekComparison(input.days, input.studyCompare, input.todayKey);
  const week = weekLines(metrics);
  const band = efficiencyByBand(input.sessions);
  const length = efficiencyByLength(input.sessions);
  const digitalBed = digitalVsBed(input.days);
  const bedNextDay = bedVsNextDay(input.days, input.sessions);
  const motivation = motivationInsights(input.days);
  const { top, nearest } = pickTop([week, band, length, digitalBed, bedNextDay, motivation]);
  return { week: { ...week, headline: weekHeadline(metrics) }, study: { band, length }, sleep: { digitalBed, bedNextDay }, motivation, top, nearest };
}
