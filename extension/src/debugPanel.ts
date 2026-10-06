// 開発ビルド専用。通常ビルドでは options.ts の呼び出しごと取り除かれる。
import { getClockOffsetMs, getNow, setDebugTime } from './clock';

export function mountDebugPanel(root: HTMLElement): void {
  root.innerHTML = `
    <h2 style="font-size:14px;color:#98a2b8;margin-top:36px">開発用：仮想の現在時刻</h2>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input id="dbgTime" class="dev" type="time" />
      <button id="dbgSet">この時刻にする</button>
      <button id="dbgClear">実時刻に戻す</button>
      <span id="dbgNow" style="font-size:13px;color:#98a2b8"></span>
    </div>`;
  const input = root.querySelector<HTMLInputElement>('#dbgTime')!;
  const label = root.querySelector<HTMLElement>('#dbgNow')!;
  root.querySelector('#dbgSet')!.addEventListener('click', async () => {
    if (input.value) await setDebugTime(input.value);
  });
  root.querySelector('#dbgClear')!.addEventListener('click', () => void setDebugTime(null));
  const show = async () => {
    const offset = await getClockOffsetMs();
    label.textContent = `${offset === 0 ? '実時刻' : '仮想時刻'} ${(await getNow()).toLocaleTimeString('ja-JP')}`;
  };
  void show();
  setInterval(() => void show(), 1000);
}
