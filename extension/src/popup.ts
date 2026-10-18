import { getNow } from './clock';
import { clampSets, makePlan, phaseAt, planEnd, type FocusMode } from './core/focus';
import { getFocusPlan, startFocus } from './storage/focus';
import { countUnlocksTonight } from './core/night';
import { getNextTransition, getStage } from './core/stage';
import { formatHms } from './core/time';
import type { Stage } from './core/types';
import { getEvents } from './storage/eventLog';
import { enqueueBed, getRemoteStatus, isConfigured, loadRemote, outboxSize } from './storage/remote';
import { loadSettings } from './storage/settings';

const STAGE_LABEL: Record<Stage, string> = {
  none: '制限なし',
  prepare: '寝る準備の時間',
  soft: '制限中（Shorts・X・Instagram）',
  hard: '制限中（YouTube 全体も）',
};
const NEXT_LABEL: Record<Stage, string> = {
  none: '自動解除まで',
  prepare: '寝る準備まで',
  soft: '制限開始まで',
  hard: 'YouTube 全体の制限まで',
};
const $ = (id: string) => document.getElementById(id)!;
const readSetup = (): { mode: FocusMode; sets: number } => ({
  mode: ($('mode') as HTMLSelectElement).value as FocusMode,
  sets: clampSets(Number(($('sets') as HTMLInputElement).value)),
});
let armed = false; // 開始ボタンを1回押して、確認待ちの状態

async function render(): Promise<void> {
  const [settings, now, events] = await Promise.all([loadSettings(), getNow(), getEvents()]);
  const stage = getStage(settings, now);
  const next = getNextTransition(settings, now);
  $('stage').textContent = STAGE_LABEL[stage];
  $('nextLabel').textContent = NEXT_LABEL[next.to];
  $('next').textContent = formatHms(next.at.getTime() - now.getTime());
  $('unlocks').textContent = `${countUnlocksTonight(events, now, settings.releaseTime)} 回`;
  const [size, status] = await Promise.all([outboxSize(), getRemoteStatus()]);
  $('sync').textContent = status.lastError ? `送信エラー：${status.lastError}（未送信 ${size} 件）` : size > 0 ? `未送信 ${size} 件` : '';
  const ph = phaseAt(await getFocusPlan(), now.getTime());
  const btn = $('focus') as HTMLButtonElement;
  const active = ph.kind !== 'done';
  btn.disabled = active;
  $('focusSetup').style.display = active ? 'none' : 'grid';
  if (ph.kind !== 'done') {
    btn.textContent = ph.kind === 'focus' ? `集中中（${ph.set}/${ph.sets}）` : `休憩中（${ph.set}/${ph.sets}）`;
    $('focusMsg').textContent = `${ph.kind === 'focus' ? '集中' : '休憩'}があと ${formatHms(ph.endMs - now.getTime())}（取り消せません）`;
  } else if (!armed) {
    btn.textContent = '集中を始める';
    $('focusMsg').textContent = '';
  }
  const sel = readSetup();
  const total = Math.round((planEnd(makePlan(sel.mode, sel.sets, 0)) - 0) / 60_000);
  $('planInfo').textContent = active ? '' : `合計 ${Math.floor(total / 60)}時間${total % 60}分（${sel.sets}セット）`;
  if (__DEV__) $('devTime').textContent = `[DEV] 現在 ${now.toLocaleTimeString('ja-JP')}`;
}

$('bed').addEventListener('click', async () => {
  if (!isConfigured(await loadRemote())) {
    $('bedMsg').textContent = '設定画面で Life OS の URL とトークンを設定してください';
    return;
  }
  await enqueueBed(await getNow());
  $('bedMsg').textContent = '就寝を記録しました。おやすみなさい 🌙';
});
// 1回目：確認、2回目：開始。始めたら取り消す手段はない
$('focus').addEventListener('click', async () => {
  if (!armed) {
    armed = true;
    $('focus').textContent = '本当に始める（取り消せません）';
    return;
  }
  armed = false;
  const { mode, sets } = readSetup();
  await startFocus(mode, sets, (await getNow()).getTime());
  void render();
});
$('options').addEventListener('click', () => void chrome.runtime.openOptionsPage());
void render();
setInterval(() => void render(), 1000);
