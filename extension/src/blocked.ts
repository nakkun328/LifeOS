import { getClockOffsetMs } from './clock';
import { classify, shouldBlock } from './core/match';
import { formatSleep, remainingSleepMs, splitDuration } from './core/sleep';
import { getStage } from './core/stage';
import type { Site } from './core/types';
import { recordUnlocked } from './storage/eventLog';
import { enqueueBed, isConfigured, loadRemote } from './storage/remote';
import { loadSettings } from './storage/settings';
import { getUnlocks, setUnlock } from './storage/unlock';

const SITE_NAMES: Record<Site, string> = { youtube: 'YouTube', x: 'X', instagram: 'Instagram' };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const site = params.get('site') as Site | null;
const originalUrl = params.get('url') ?? '';

let offset = 0;
const nowDate = () => new Date(Date.now() + offset);

function goBack(): void {
  // https のページにだけ戻る（javascript: などへの遷移を避ける）
  try {
    if (new URL(originalUrl).protocol === 'https:') location.replace(originalUrl);
  } catch {
    // 不正なURLなら何もしない
  }
}

async function init(): Promise<void> {
  offset = await getClockOffsetMs();
  const settings = await loadSettings();
  if (site && site in SITE_NAMES) {
    $('siteLabel').textContent = `${SITE_NAMES[site]}は、今夜はここまでにしませんか`;
  }

  const reason = $<HTMLInputElement>('reason');
  const unlockBtn = $<HTMLButtonElement>('unlock');
  const cancelBtn = $<HTMLButtonElement>('cancel');
  const waitEl = $('wait');
  let waitTimer: number | undefined;

  const tick = async (): Promise<void> => {
    offset = await getClockOffsetMs(); // 通常ビルドでは常に 0
    const now = nowDate();
    const ms = remainingSleepMs(now, settings.wakeTime);
    const { seconds } = splitDuration(ms);
    $('sleep').innerHTML = `${formatSleep(ms)}<small>${String(seconds).padStart(2, '0')}秒</small>`;

    // 朝になった・別タブで解除した、などで制限が外れていたら元のページへ戻す
    const current = await loadSettings();
    const target = classify(originalUrl, current.allowedPlaylists);
    if (!target || !shouldBlock(getStage(current, now), target, await getUnlocks(), now.getTime())) {
      goBack();
    }
  };
  void tick();
  setInterval(() => void tick(), 1000);

  reason.addEventListener('input', () => {
    unlockBtn.disabled = reason.value.trim() === '' || waitTimer !== undefined;
  });

  const stopWaiting = (): void => {
    if (waitTimer !== undefined) clearInterval(waitTimer);
    waitTimer = undefined;
    waitEl.textContent = '';
    cancelBtn.hidden = true;
    reason.disabled = false;
    unlockBtn.disabled = reason.value.trim() === '';
  };

  unlockBtn.addEventListener('click', () => {
    if (!site || reason.value.trim() === '') return;
    let left = settings.waitSeconds;
    reason.disabled = true;
    unlockBtn.disabled = true;
    cancelBtn.hidden = false;
    const step = async (): Promise<void> => {
      if (left > 0) {
        waitEl.textContent = `あと ${left} 秒。ひと呼吸おいて、本当に必要か考えてみましょう。`;
        left -= 1;
        return;
      }
      stopWaiting();
      const now = nowDate();
      await setUnlock(site, now.getTime() + settings.unlockMinutes * 60_000, now.getTime());
      await recordUnlocked(site, reason.value.trim(), now);
      goBack();
    };
    void step();
    waitTimer = window.setInterval(() => void step(), 1000);
  });
  cancelBtn.addEventListener('click', stopWaiting);

  $('bed').addEventListener('click', async () => {
    const msg = $('bedMsg');
    if (!isConfigured(await loadRemote())) {
      msg.textContent = '設定画面で、Life OS の URL とトークンを設定すると記録できます。';
      return;
    }
    await enqueueBed(nowDate());
    msg.textContent = '就寝を記録しました。おやすみなさい 🌙';
    ($('bed') as HTMLButtonElement).disabled = true;
  });

  $('close').addEventListener('click', async () => {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
    else window.close();
  });
}

void init();
