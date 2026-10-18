import { getClockOffsetMs, getNow, isClockChange } from './clock';
import { classify, shouldBlock } from './core/match';
import { nightKey } from './core/night';
import { formatSleep, remainingSleepMs } from './core/sleep';
import { getNextTransition, getStage } from './core/stage';
import { PIP_CHANGED_MESSAGE } from './pipState';
import { TAB_PATTERNS } from './sites';
import { recordBlocked } from './storage/eventLog';
import { flushOutbox } from './storage/remote';
import { IDLE_SECONDS, syncTracking } from './tracker';
import { loadSettings } from './storage/settings';
import { syncSettings } from './storage/syncSettings';
import { getUnlocks } from './storage/unlock';
import { getFocusEnd } from './storage/focus';
import { isFocusing } from './core/focus';

// 制限するかどうかは常に「現在時刻」から判定する。
// アラームは「判定し直すきっかけ」にすぎず、遅れても発火しなくても結果は壊れない。
const SWEEP_ALARM = 'ng-sweep'; // 1分ごとの保険
const BOUNDARY_ALARM = 'ng-boundary'; // 次の段階の切り替わり
const EXPIRE_ALARM = 'ng-expire'; // 一時解除の期限切れ
const FOCUS_ALARM = 'ng-focus'; // 集中タイマーの終了

const SITE_FILTER: chrome.events.UrlFilter[] = [
  { hostEquals: 'youtube.com' },
  { hostSuffix: '.youtube.com' },
  { hostEquals: 'x.com' },
  { hostSuffix: '.x.com' },
  { hostEquals: 'twitter.com' },
  { hostSuffix: '.twitter.com' },
  { hostEquals: 'instagram.com' },
  { hostSuffix: '.instagram.com' },
  { hostEquals: 'tiktok.com' },
  { hostSuffix: '.tiktok.com' },
];

/** 1つのタブを現在時刻で判定し、制限対象ならブロック画面に差し替える */
async function evaluateTab(tabId: number, url: string): Promise<void> {
  const settings = await loadSettings();
  const now = await getNow();
  // 集中中は、許可リストも一時解除も効かせず、対象サイトをすべて止める
  const focusing = isFocusing(await getFocusEnd(), now.getTime());
  const target = classify(url, focusing ? [] : settings.allowedPlaylists);
  if (!target) return;
  if (!focusing && !shouldBlock(getStage(settings, now), target, await getUnlocks(), now.getTime())) return;

  const blocked = new URL(chrome.runtime.getURL('blocked.html'));
  blocked.searchParams.set('site', target.site);
  blocked.searchParams.set('url', url);
  if (focusing) blocked.searchParams.set('focus', '1');
  try {
    await chrome.tabs.update(tabId, { url: blocked.toString() });
  } catch {
    return; // タブが閉じられた等
  }
  await recordBlocked(target.site, tabId, now);
}

async function evaluateOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: TAB_PATTERNS });
  await Promise.all(
    tabs.flatMap((t) => (t.id !== undefined && t.url ? [evaluateTab(t.id, t.url)] : [])),
  );
}

/** 「寝る準備」の通知。23:15 を過ぎていたら出さない（prepare の間だけ出る） */
async function maybeNotify(): Promise<void> {
  const settings = await loadSettings();
  const now = await getNow();
  if (getStage(settings, now) !== 'prepare') return;
  const key = nightKey(now, settings.releaseTime);
  const r = await chrome.storage.local.get('notifiedNight');
  if (r.notifiedNight === key) return;
  await chrome.storage.local.set({ notifiedNight: key });
  const sleep = formatSleep(remainingSleepMs(now, settings.wakeTime));
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'そろそろ寝る準備を',
    message: `今寝れば ${sleep} 眠れます。明日の朝が少し楽になります。`,
  });
}

async function scheduleAlarms(): Promise<void> {
  if (!(await chrome.alarms.get(SWEEP_ALARM))) {
    await chrome.alarms.create(SWEEP_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  }
  const settings = await loadSettings();
  const now = await getNow();
  const offset = await getClockOffsetMs(); // 通常ビルドでは常に 0
  const slack = 1000;

  const next = getNextTransition(settings, now);
  await chrome.alarms.create(BOUNDARY_ALARM, { when: next.at.getTime() - offset + slack });

  const expiries = Object.values(await getUnlocks()).filter((t) => t > now.getTime());
  if (expiries.length > 0) {
    await chrome.alarms.create(EXPIRE_ALARM, { when: Math.min(...expiries) - offset + slack });
  } else {
    await chrome.alarms.clear(EXPIRE_ALARM);
  }

  const focusEnd = await getFocusEnd();
  if (isFocusing(focusEnd, now.getTime())) {
    await chrome.alarms.create(FOCUS_ALARM, { when: (focusEnd as number) - offset + slack });
  } else {
    await chrome.alarms.clear(FOCUS_ALARM);
  }
}

/** 集中が終わった通知。終了時刻ごとに1回だけ */
async function maybeNotifyFocusEnd(): Promise<void> {
  const end = await getFocusEnd();
  if (end === undefined || isFocusing(end, (await getNow()).getTime())) return;
  const r = await chrome.storage.local.get('notifiedFocus');
  if (r.notifiedFocus === end) return;
  await chrome.storage.local.set({ notifiedFocus: end });
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: '50分、おつかれさまでした',
    message: '集中タイマーが終わりました。少し休みましょう。',
  });
}

/** アラーム・起動・設定変更のどれから呼ばれても同じ結果になる */
async function sweep(): Promise<void> {
  await syncSettings().catch(() => undefined); // Life OS の Settings を、10分に1回まで取り込む（オフラインなら手元の値のまま）
  await syncTracking().catch(() => undefined);
  await flushOutbox().catch(() => undefined);
  await maybeNotify();
  await maybeNotifyFocusEnd();
  await evaluateOpenTabs();
  await scheduleAlarms();
}

chrome.webNavigation.onBeforeNavigate.addListener(
  (d) => {
    if (d.frameId === 0) void evaluateTab(d.tabId, d.url);
  },
  { url: SITE_FILTER },
);
// YouTube などの SPA 遷移（pushState）
chrome.webNavigation.onHistoryStateUpdated.addListener(
  (d) => {
    if (d.frameId === 0) void evaluateTab(d.tabId, d.url);
  },
  { url: SITE_FILTER },
);

// 利用時間の計測：前面の状態が変わったら、直前までの分を数え直す
const sync = () => void syncTracking().catch(() => undefined);
chrome.idle.setDetectionInterval(IDLE_SECONDS);
// PiP の開始・終了（ページのスクリプトからの通知）
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === PIP_CHANGED_MESSAGE) sync();
});
chrome.idle.onStateChanged.addListener(sync);
chrome.tabs.onActivated.addListener(sync);
chrome.windows.onFocusChanged.addListener(sync);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url || info.status === 'complete' || info.audible !== undefined) sync();
});

chrome.alarms.onAlarm.addListener(() => void sweep());
chrome.runtime.onStartup.addListener(() => void sweep());
chrome.runtime.onInstalled.addListener(() => void sweep());
chrome.storage.onChanged.addListener((changes, area) => {
  // 解除などの記録が積まれたら、ページが閉じる前に切り離してすぐ送る（利用時間は1分ごとの同期でまとめて送る）
  const queued = changes.outbox?.newValue as Array<{ payload: { type?: string } }> | undefined;
  if (area === 'local' && queued?.some((i) => i.payload.type !== 'usage')) void flushOutbox().catch(() => undefined);
  if (area === 'local' && changes.focusEndAt) void evaluateOpenTabs(); // 開始した瞬間に、開いているタブも止める
  if (area === 'local' && changes.remote) void syncSettings(true).catch(() => undefined); // 接続を保存したら、すぐ取り込む
  if (area === 'local' && (changes.settings || changes.unlocks || changes.focusEndAt || isClockChange(changes))) {
    void scheduleAlarms();
  }
});

// サービスワーカーが起こされるたびに、アラームが生きているか確認する
void scheduleAlarms();
