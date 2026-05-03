import { describe, expect, it } from 'vitest';
import {
  beginSidePanelResize,
  getSidePanelDragWidth,
  getSidePanelKeyboardWidth,
  shouldFinishSidePanelResize
} from '../../src/renderer/src/side-panel-resize';

describe('side panel resize helpers', () => {
  it('starts only for the primary mouse button', () => {
    expect(beginSidePanelResize({ button: 1, pointerId: 7, clientX: 100, currentWidth: 360 })).toBeNull();
    expect(beginSidePanelResize({ button: 0, pointerId: 7, clientX: 100, currentWidth: 360 })).toEqual({
      pointerId: 7,
      startX: 100,
      startWidth: 360
    });
  });

  it('calculates drag width for the active pointer and clamps to viewport-aware bounds', () => {
    const state = { pointerId: 7, startX: 100, startWidth: 360 };

    expect(getSidePanelDragWidth(state, 8, 500, 900)).toBeNull();
    expect(getSidePanelDragWidth(state, 7, 520, 900)).toBe(380);
    expect(getSidePanelDragWidth(state, 7, -200, 900)).toBe(220);
  });

  it('identifies matching pointer-up events before finishing', () => {
    const state = { pointerId: 7, startX: 100, startWidth: 360 };

    expect(shouldFinishSidePanelResize(state, 8)).toBe(false);
    expect(shouldFinishSidePanelResize(state, 7)).toBe(true);
    expect(shouldFinishSidePanelResize(null, 7)).toBe(false);
  });

  it('resizes by keyboard step only for horizontal arrow keys', () => {
    expect(getSidePanelKeyboardWidth(360, 'Enter', 1200)).toBeNull();
    expect(getSidePanelKeyboardWidth(360, 'ArrowLeft', 1200)).toBe(344);
    expect(getSidePanelKeyboardWidth(360, 'ArrowRight', 1200)).toBe(376);
    expect(getSidePanelKeyboardWidth(224, 'ArrowLeft', 1200)).toBe(220);
  });
});
