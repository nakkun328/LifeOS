import { getNow } from './clock';
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
$('options').addEventListener('click', () => void chrome.runtime.openOptionsPage());
void render();
setInterval(() => void render(), 1000);
