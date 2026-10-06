import { describe, expect, it } from 'vitest';
import { pipState } from './pipState';

describe('pipState', () => {
  it('PiP が開いていなければ、再生中ではない', () => {
    expect(pipState({ pictureInPictureElement: null })).toEqual({ pip: false, playing: false });
    expect(pipState({})).toEqual({ pip: false, playing: false });
  });
  it('PiP で再生中', () => {
    expect(pipState({ pictureInPictureElement: { paused: false, ended: false } })).toEqual({ pip: true, playing: true });
  });
  it('PiP は開いているが、一時停止中・再生終了なら数えない', () => {
    expect(pipState({ pictureInPictureElement: { paused: true, ended: false } })).toEqual({ pip: true, playing: false });
    expect(pipState({ pictureInPictureElement: { paused: false, ended: true } })).toEqual({ pip: true, playing: false });
  });
});
