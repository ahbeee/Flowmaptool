import { describe, expect, it } from 'vitest';
import {
  clamp,
  clampSidePanelWidth,
  COLOR_SWATCHES,
  EDGE_LINE_TYPES,
  FONT_FAMILIES,
  getTheme,
  NODE_SHAPES,
  PNG_FILTER,
  SIDE_PANEL_DEFAULT_WIDTH,
  SIDE_PANEL_MAX_WIDTH,
  SIDE_PANEL_MIN_WIDTH,
  SPACING_MAX,
  SPACING_MIN,
  THEMES
} from '../../src/renderer/src/ui-config';

describe('ui config helpers', () => {
  it('provides stable toolbar option defaults', () => {
    expect(SPACING_MIN).toBe(0);
    expect(SPACING_MAX).toBe(320);
    expect(FONT_FAMILIES).toContain('Roboto');
    expect(COLOR_SWATCHES[0]).toBe('#111827');
    expect(EDGE_LINE_TYPES).toEqual([
      { value: 'solid', label: 'Solid' },
      { value: 'dashed', label: 'Dashed' },
      { value: 'dotted', label: 'Dotted' }
    ]);
    expect(NODE_SHAPES.map(shape => shape.value)).toEqual(['plain', 'rounded', 'pill', 'underline', 'square']);
    expect(PNG_FILTER).toEqual([{ name: 'PNG Image', extensions: ['png'] }]);
  });

  it('resolves known and fallback themes', () => {
    expect(getTheme('dark')).toBe(THEMES.dark);
    expect(getTheme('missing')).toBe(THEMES['blue-gray']);
  });

  it('clamps numeric values', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('clamps side panel width against fixed and viewport limits', () => {
    expect(SIDE_PANEL_DEFAULT_WIDTH).toBe(360);
    expect(clampSidePanelWidth(100, 1200)).toBe(SIDE_PANEL_MIN_WIDTH);
    expect(clampSidePanelWidth(900, 2000)).toBe(SIDE_PANEL_MAX_WIDTH);
    expect(clampSidePanelWidth(500, 900)).toBe(380);
    expect(clampSidePanelWidth(500, 600)).toBe(SIDE_PANEL_MIN_WIDTH);
  });
});
