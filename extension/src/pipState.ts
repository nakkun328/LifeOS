// ピクチャインピクチャ（PiP）の状態。ページ側（pip.ts）が答え、tracker.ts が使う。
export const PIP_STATE_MESSAGE = 'ng-pip-state';
export const PIP_CHANGED_MESSAGE = 'ng-pip-changed';

export type PipState = { pip: boolean; playing: boolean };

type VideoLike = { paused: boolean; ended: boolean };

/** そのページで PiP が開いていて、動画が再生中か */
export function pipState(doc: { pictureInPictureElement?: VideoLike | null }): PipState {
  const el = doc.pictureInPictureElement;
  if (!el) return { pip: false, playing: false };
  return { pip: true, playing: !el.paused && !el.ended };
}
