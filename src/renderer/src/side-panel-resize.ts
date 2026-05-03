import { clampSidePanelWidth } from './ui-config';

export const SIDE_PANEL_KEYBOARD_STEP = 16;

export type SidePanelResizeState = {
  pointerId: number;
  startX: number;
  startWidth: number;
};

export function beginSidePanelResize(options: {
  button: number;
  pointerId: number;
  clientX: number;
  currentWidth: number;
}): SidePanelResizeState | null {
  if (options.button !== 0) return null;
  return {
    pointerId: options.pointerId,
    startX: options.clientX,
    startWidth: options.currentWidth
  };
}

export function getSidePanelDragWidth(
  resizeState: SidePanelResizeState | null,
  pointerId: number,
  clientX: number,
  viewportWidth?: number
): number | null {
  if (!resizeState || resizeState.pointerId !== pointerId) return null;
  return clampSidePanelWidth(resizeState.startWidth + clientX - resizeState.startX, viewportWidth);
}

export function shouldFinishSidePanelResize(resizeState: SidePanelResizeState | null, pointerId: number): boolean {
  return Boolean(resizeState && resizeState.pointerId === pointerId);
}

export function getSidePanelKeyboardWidth(currentWidth: number, key: string, viewportWidth?: number): number | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const delta = key === 'ArrowLeft' ? -SIDE_PANEL_KEYBOARD_STEP : SIDE_PANEL_KEYBOARD_STEP;
  return clampSidePanelWidth(currentWidth + delta, viewportWidth);
}
