import { describe, expect, it } from 'vitest';
import {
  createChildNodeStyle,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  estimateNodeSize,
  fallbackTextWidth,
  NODE_MAX_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_MIN_WIDTH,
  quoteFontFamily,
  ROOT_NODE_STYLE
} from '../../src/renderer/src/node-style';

describe('node style helpers', () => {
  it('provides root and child defaults', () => {
    expect(ROOT_NODE_STYLE).toEqual({
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: DEFAULT_FONT_SIZE,
      shape: 'rounded'
    });
    expect(createChildNodeStyle('pill')).toEqual({
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: DEFAULT_FONT_SIZE,
      shape: 'pill'
    });
  });

  it('quotes font families only when needed', () => {
    expect(quoteFontFamily('Roboto')).toBe('Roboto');
    expect(quoteFontFamily('Noto Sans TC')).toBe('"Noto Sans TC"');
    expect(quoteFontFamily('A"B')).toBe('"A\\"B"');
  });

  it('uses wider fallback widths for CJK/full-width characters', () => {
    expect(fallbackTextWidth('abcd', 10)).toBeCloseTo(20.8);
    expect(fallbackTextWidth('測試', 10)).toBe(20);
  });

  it('estimates node size within configured bounds', () => {
    expect(estimateNodeSize('', { fontSize: 12 })).toEqual({ width: NODE_MIN_WIDTH, height: NODE_MIN_HEIGHT });

    const large = estimateNodeSize('x'.repeat(200), { fontSize: 64 });
    expect(large.width).toBe(NODE_MAX_WIDTH);
    expect(large.height).toBeGreaterThan(NODE_MIN_HEIGHT);
  });
});
