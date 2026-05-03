import { describe, expect, it } from 'vitest';
import {
  boxesOverlap,
  clampNodeLabel,
  edgeStrokeDasharray,
  effectiveEdgeStyle,
  hasMixedValues,
  nextCustomTagId,
  sameValues
} from '../../src/renderer/src/ui-helpers';

describe('UI helpers', () => {
  it('detects box overlap with an optional gap', () => {
    const left = { left: 0, right: 10, top: 0, bottom: 10 };
    const touching = { left: 10, right: 20, top: 0, bottom: 10 };
    const separated = { left: 12, right: 22, top: 0, bottom: 10 };

    expect(boxesOverlap(left, touching)).toBe(false);
    expect(boxesOverlap(left, touching, 1)).toBe(true);
    expect(boxesOverlap(left, separated, 1)).toBe(false);
  });

  it('clamps labels and allocates the next available custom tag id', () => {
    expect(clampNodeLabel('abcdef', 3)).toBe('abc');
    expect(nextCustomTagId([
      { id: 'tag-custom-1', name: 'A', color: '#000' },
      { id: 'tag-custom-3', name: 'B', color: '#111' },
      { id: 'tag-blue', name: 'Blue', color: '#222' }
    ])).toBe('tag-custom-4');
  });

  it('summarizes same and mixed values', () => {
    expect(sameValues(['Roboto', 'Roboto'])).toBe('Roboto');
    expect(sameValues(['Roboto', 'Arial'])).toBe('');
    expect(hasMixedValues([12, 12, 14])).toBe(true);
    expect(hasMixedValues([12, 12])).toBe(false);
  });

  it('normalizes edge style and dash arrays', () => {
    expect(effectiveEdgeStyle({ id: 'e1', from: 'n1', to: 'n2', style: { lineType: 'dotted' } }, { width: 3, color: '#333' })).toEqual({
      width: 3,
      lineType: 'dotted',
      color: '#333'
    });
    expect(edgeStrokeDasharray('solid', 2)).toBeUndefined();
    expect(edgeStrokeDasharray('dashed', 2)).toBe('8 6');
    expect(edgeStrokeDasharray('dotted', 2)).toBe('1 6');
  });
});
