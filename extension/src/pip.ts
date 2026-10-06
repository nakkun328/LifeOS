// コンテンツスクリプト：このタブの動画が PiP で再生中かを、拡張の本体（背景）に答える。
// 背景のタブや別アプリを見ている間に PiP で見ている時間を、利用時間に数えるために使う。
import { PIP_CHANGED_MESSAGE, PIP_STATE_MESSAGE, pipState } from './pipState';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== PIP_STATE_MESSAGE) return;
  sendResponse(pipState(document as unknown as Parameters<typeof pipState>[0]));
});

// PiP の開始・終了を知らせて、計測を切り替える（拡張を更新した直後などで失敗しても無視する）
const notify = () => {
  try {
    void chrome.runtime.sendMessage({ type: PIP_CHANGED_MESSAGE }).catch(() => undefined);
  } catch {
    // 拡張のコンテキストが無効
  }
};
document.addEventListener('enterpictureinpicture', notify, true);
document.addEventListener('leavepictureinpicture', notify, true);
