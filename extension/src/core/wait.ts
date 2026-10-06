// 一時解除の待ち時間。ブロック画面を実際に見ている間だけ進める。
// 別のウィンドウ・タブ・アプリへ移っている間は一時停止し、戻ったら続きから数える。

/** この画面が前面で見えているか（タブが表示中で、ウィンドウにフォーカスがある） */
export const isAttending = (visibility: string, hasFocus: boolean): boolean => visibility === 'visible' && hasFocus;

export type WaitStep = { left: number; state: 'counting' | 'paused' | 'done' };

/**
 * 1秒ごとの判定。left は残り秒数。
 *  - 見ていない → 一時停止（残りはそのまま）
 *  - 見ている   → 残りがあれば1秒進める。0 になったら done
 */
export function stepWait(left: number, attending: boolean): WaitStep {
  if (!attending) return { left, state: 'paused' };
  if (left > 0) return { left: left - 1, state: 'counting' };
  return { left: 0, state: 'done' };
}
