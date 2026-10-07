// Discord の Interactions を Life OS の操作に変える。
// 認証（署名検証）は呼び出し側（API ルート）で済んでいる前提。ここでは「持ち主だけが操作できる」を担当する。
import { dayKey, jstParts, parseHm } from '@/lib/jst';
import { formatDuration, sleepRemainingMs } from '@/lib/messages';
import { parseDue } from '@/lib/due';
import type { Ctx } from '../context';
import { HttpError } from '../errors';
import { addLog } from '../handlers/logs';
import { startSession, stopSession } from '../handlers/sessions';
import { recordBed, recordWake } from '../handlers/sleep';
import { listSubjects } from '../handlers/subjects';
import { getAppSettings } from '../handlers/settings';
import { createTask, listTasks } from '../handlers/tasks';
import { buildToday } from '../handlers/today';
import { buildWeek } from '../handlers/week';
import { formatTasks, formatToday, formatWeek } from './format';

export type Interaction = {
  type: number;
  member?: { user?: { id?: string } };
  user?: { id?: string };
  data?: {
    name?: string;
    custom_id?: string;
    options?: Array<{ name: string; value?: unknown }>;
    values?: string[];
  };
};

export type InteractionResponse = {
  type: number;
  data?: { content: string; flags?: number; components?: unknown[] };
};

const PONG = 1;
const MESSAGE = 4;
const EPHEMERAL = 64;

const reply = (content: string, extra: { ephemeral?: boolean; components?: unknown[] } = {}): InteractionResponse => ({
  type: MESSAGE,
  data: {
    content,
    ...(extra.ephemeral === false ? {} : { flags: EPHEMERAL }),
    ...(extra.components ? { components: extra.components } : {}),
  },
});

const button = (label: string, custom_id: string, style = 2) => ({ type: 2, style, label, custom_id });

/** /panel で出すボタン。Discord の1行は5個まで */
export const PANEL_COMPONENTS = [
  { type: 1, components: [button('勉強開始', 'panel:study', 1), button('部活開始', 'panel:club'), button('終了', 'panel:stop', 4)] },
  { type: 1, components: [button('寝る', 'panel:bed', 1), button('起きた', 'panel:wake')] },
  { type: 1, components: [button('今日', 'panel:today'), button('今週', 'panel:week')] },
];

const optionValue = (i: Interaction, name: string): string => {
  const v = i.data?.options?.find((o) => o.name === name)?.value;
  return typeof v === 'string' ? v : '';
};

export async function handleInteraction(
  ctx: Ctx,
  interaction: Interaction,
  ownerId: string | undefined,
): Promise<InteractionResponse> {
  if (interaction.type === 1) return { type: PONG };

  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!ownerId) return reply('持ち主の設定（DISCORD_OWNER_ID）がまだです。SETUP.md を確認してください。');
  if (!userId || userId !== ownerId) return reply('このボットは持ち主だけが使えます。');

  try {
    if (interaction.type === 2) return await handleCommand(ctx, interaction);
    if (interaction.type === 3) return await handleComponent(ctx, interaction);
    return reply('対応していない操作です。');
  } catch (e) {
    if (e instanceof HttpError) return reply(`⚠️ ${e.message}`);
    console.error(e);
    return reply('⚠️ うまくいきませんでした。少し待ってからもう一度試してください。');
  }
}

async function handleCommand(ctx: Ctx, i: Interaction): Promise<InteractionResponse> {
  switch (i.data?.name) {
    case 'panel':
      return reply('Life OS の操作パネル', { ephemeral: false, components: PANEL_COMPONENTS });
    case 'log': {
      const log = await addLog(ctx, { tag: optionValue(i, 'tag'), body: optionValue(i, 'text') });
      return reply(`💬 [${log.tag}] ${log.body}`);
    }
    case 'decision': {
      const d = await addLog(ctx, { kind: 'decision', body: optionValue(i, 'text'), title: optionValue(i, 'title') });
      return reply(`📌 決定事項を残しました${d.title ? `（${d.title}）` : ''}\n${d.body}`);
    }
    case 'tasks': {
      const open = (await listTasks(ctx)).filter((t) => t.status !== 'done').slice(0, 10);
      return reply(formatTasks(open));
    }
    case 'task': {
      const due = parseDue(optionValue(i, 'due'), dayKey(ctx.now, ctx.config.boundaryMin));
      if (!due) return reply('⚠️ 期限を読み取れませんでした。例：10/9、明日、3日後、2026-10-09');
      const task = await createTask(ctx, { title: optionValue(i, 'name'), due_date: due });
      return reply(`📝 「${task.title}」を追加しました（期限 ${task.due_date}）`);
    }
    case 'today':
      return reply(formatToday(await buildToday(ctx)));
    case 'week':
      return reply(formatWeek(await buildWeek(ctx)));
    case 'sleep':
      return reply(await bed(ctx));
    default:
      return reply('知らないコマンドです。');
  }
}

async function handleComponent(ctx: Ctx, i: Interaction): Promise<InteractionResponse> {
  switch (i.data?.custom_id) {
    case 'panel:study': {
      const subjects = await listSubjects(ctx);
      if (subjects.length === 0) return reply('科目がまだありません。Web の Today から追加してください。');
      return reply('科目を選んでください', {
        components: [
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: 'study:pick',
                placeholder: '科目',
                options: subjects.slice(0, 25).map((s) => ({ label: s.name.slice(0, 100), value: s.id })),
              },
            ],
          },
        ],
      });
    }
    case 'study:pick': {
      const subjectId = i.data?.values?.[0];
      const session = await startSession(ctx, { kind: 'study', subject_id: subjectId });
      const subject = (await listSubjects(ctx)).find((s) => s.id === session.subject_id);
      return reply(`📚 ${subject?.name ?? '勉強'} を始めました`);
    }
    case 'panel:club':
      await startSession(ctx, { kind: 'club' });
      return reply('🏃 部活を始めました');
    case 'panel:stop': {
      const s = await stopSession(ctx, {});
      const seconds = (Date.parse(s.ended_at!) - Date.parse(s.started_at)) / 1000;
      const what = s.kind === 'club' ? '部活' : ((await listSubjects(ctx)).find((x) => x.id === s.subject_id)?.name ?? '勉強');
      return reply(`おつかれさま。${what} ${formatDuration(seconds)}`);
    }
    case 'panel:bed':
      return reply(await bed(ctx));
    case 'panel:wake': {
      const w = await recordWake(ctx, {});
      const seconds = (Date.parse(w.wake_at!) - Date.parse(w.sleep_at)) / 1000;
      return reply(`おはようございます ☀️ 睡眠 ${formatDuration(seconds)}`);
    }
    case 'panel:today':
      return reply(formatToday(await buildToday(ctx)));
    case 'panel:week':
      return reply(formatWeek(await buildWeek(ctx)));
    default:
      return reply('知らないボタンです。');
  }
}

async function bed(ctx: Ctx): Promise<string> {
  const { sleep, created } = await recordBed(ctx, {});
  const at = jstParts(new Date(sleep.sleep_at));
  const hhmm = `${String(at.hh).padStart(2, '0')}:${String(at.mm).padStart(2, '0')}`;
  if (!created) return `すでに ${hhmm} に就寝を記録しています。`;
  const p = jstParts(ctx.now);
  const wake = (await getAppSettings(ctx)).sleep.wakeTime; // 起床予定は Settings の値
  const ms = sleepRemainingMs(ctx.now.getTime(), p.hh * 60 + p.mm, parseHm(wake) ?? 375);
  return `おやすみなさい 🌙 ${hhmm} に記録しました。今寝れば ${formatDuration(ms / 1000)} 眠れます。`;
}
