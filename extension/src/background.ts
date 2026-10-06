import { getClockOffsetMs, getNow, isClockChange } from './clock';
import { classify, shouldBlock } from './core/match';
import { nightKey } from './core/night';
import { formatSleep, remainingSleepMs } from './core/sleep';
import { getNextTransition, getStage } from './core/stage';
import { recordBlocked } from './storage/eventLog';
import { loadSettings } from './storage/settings';
import { getUnlocks } from './storage/unlock';

// 制限するかどうかは常に「現在時刻」から判定する。
// アラームは「判定し直すきっかけ」にすぎず、遅れても発火しなくても結果は壊れない。
const SWEEP_ALARM = 'ng-sweep'; // 1分ごとの保険
const BOUNDARY_ALARM = 'ng-boundary'; // 次の段階の切り替わり
const EXPIRE_ALARM = 'ng-expire'; // 一時解除の期限切れ

const SITE_FILTER: chrome.events.UrlFilter[] = [
  { hostEquals: 'youtube.com' },
  { hostSuffix: '.youtube.com' },
  { hostEquals: 'x.com' },
  { hostSuffix: '.x.com' },
  { hostEquals: 'twitter.com' },
  { hostSuffix: '.twitter.com' },
  { hostEquals: 'instagram.com' },
  { hostSuffix: '.instagram.com' },
];
const TAB_PATTERNS = [
  'https://*.youtube.com/*',
  'https://*.x.com/*',
  'https://*.twitter.com/*',
  'https://*.instagram.com/*',
];

/** 1つのタブを現在時刻で判定し、制限対象ならブロック画面に差し替える */
async function evaluateTab(tabId: number, url: string): Promise<void> {
  const settings = await loadSettings();
  const target = classify(url, settings.allowedPlaylists);
  if (!target) return;
  const now = await getNow();
  const stage = getStage(settings, now);
  if (!shouldBlock(stage, target, await getUnlocks(), now.getTime())) return;

  const blocked = new URL(chrome.runtime.getURL('blocked.html'));
  blocked.searchParams.set('site', target.site);
  blocked.searchParams.set('url', url);
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
}

/** アラーム・起動・設定変更のどれから呼ばれても同じ結果になる */
async function sweep(): Promise<void> {
  await maybeNotify();
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

chrome.alarms.onAlarm.addListener(() => void sweep());
chrome.runtime.onStartup.addListener(() => void sweep());
chrome.runtime.onInstalled.addListener(() => void sweep());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.unlocks || isClockChange(changes))) {
    void scheduleAlarms();
  }
});

// サービスワーカーが起こされるたびに、アラームが生きているか確認する
void scheduleAlarms();
