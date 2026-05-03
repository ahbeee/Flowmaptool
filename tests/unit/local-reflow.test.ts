import { describe, expect, it } from 'vitest';
import {
  buildRenderedPositionMap,
  getLayerReorderPreview,
  hasAnyNodeOffset,
  mergeNodeOffsets,
  removeNodeOffsets,
  reorderLayerGroupOnDrop,
  reorderLayerOnDrop,
  type NodeOffsetMap
} from '../../src/shared/local-reflow';
import type { NodePosition } from '../../src/shared/layout';

const basePositions: NodePosition[] = [
  { id: 'n1', x: 80, y: 80 },
  { id: 'n2', x: 80, y: 180 },
  { id: 'n3', x: 80, y: 280 },
  { id: 'n4', x: 300, y: 80 }
];

describe('local reflow', () => {
  it('reorders only the same layer in horizontal mode', () => {
    const offsets: NodeOffsetMap = {
      n3: { dx: 0, dy: -240 }
    };
    const result = reorderLayerOnDrop(basePositions, offsets, 'n3', 'horizontal');

    expect(result.n3.dy).toBe(-200);
    expect(result.n1.dy).toBe(100);
    expect(result.n2.dy).toBe(100);
    expect(result.n4).toBeUndefined();
  });

  it('reorders only the same layer in vertical mode', () => {
    const vertical: NodePosition[] = [
      { id: 'n1', x: 80, y: 80 },
      { id: 'n2', x: 180, y: 80 },
      { id: 'n3', x: 280, y: 80 },
      { id: 'n4', x: 80, y: 300 }
    ];
    const offsets: NodeOffsetMap = {
      n1: { dx: 260, dy: 0 }
    };
    const result = reorderLayerOnDrop(vertical, offsets, 'n1', 'vertical');

    expect(result.n2.dx).toBe(-100);
    expect(result.n3.dx).toBe(-100);
    expect(result.n1.dx).toBe(200);
    expect(result.n4).toBeUndefined();
  });

  it('keeps dragged multi-selection relative order while reordering', () => {
    const offsets: NodeOffsetMap = {
      n2: { dx: 0, dy: 220 },
      n3: { dx: 0, dy: 220 }
    };
    const result = reorderLayerGroupOnDrop(basePositions, offsets, ['n2', 'n3'], 'n2', 'horizontal');

    const yN1 = basePositions[0].y + (result.n1?.dy || 0);
    const yN2 = basePositions[1].y + (result.n2?.dy || 0);
    const yN3 = basePositions[2].y + (result.n3?.dy || 0);
    expect(yN2).toBeLessThan(yN3);
    expect(yN1).toBeLessThan(yN2);
  });

  it('returns insertion preview for dragged group', () => {
    const offsets: NodeOffsetMap = {
      n3: { dx: 0, dy: -220 }
    };
    const preview = getLayerReorderPreview(basePositions, offsets, ['n3'], 'n3', 'horizontal');
    expect(preview).not.toBeNull();
    expect(preview?.insertionIndex).toBe(0);
  });

  it('detects and removes manual offsets for selected nodes', () => {
    const offsets: NodeOffsetMap = {
      n1: { dx: 0, dy: 0 },
      n2: { dx: 12, dy: 0 },
      n3: { dx: 0, dy: -4 }
    };

    expect(hasAnyNodeOffset(offsets, ['n1'])).toBe(false);
    expect(hasAnyNodeOffset(offsets, ['n1', 'n2'])).toBe(true);
    expect(removeNodeOffsets(offsets, ['n2', 'missing'])).toEqual({
      n1: { dx: 0, dy: 0 },
      n3: { dx: 0, dy: -4 }
    });
    expect(removeNodeOffsets(offsets, [])).toBe(offsets);
  });

  it('merges node offset updates and removes zero offsets', () => {
    const offsets: NodeOffsetMap = {
      n1: { dx: 4, dy: 0 },
      n2: { dx: 2, dy: 3 }
    };

    expect(mergeNodeOffsets(offsets, { n1: { dx: 4, dy: 0 } })).toBe(offsets);
    expect(mergeNodeOffsets(offsets, { n1: { dx: 0, dy: 0 }, n3: { dx: 6, dy: 7 } })).toEqual({
      n2: { dx: 2, dy: 3 },
      n3: { dx: 6, dy: 7 }
    });
    expect(mergeNodeOffsets(offsets, { missing: { dx: 0, dy: 0 } })).toBe(offsets);
  });

  it('builds rendered position maps with node offsets applied', () => {
    const rendered = buildRenderedPositionMap(basePositions, {
      n1: { dx: 5, dy: -10 },
      n3: { dx: 0, dy: 12 }
    });

    expect(rendered.get('n1')).toEqual({ id: 'n1', x: 85, y: 70 });
    expect(rendered.get('n2')).toEqual({ id: 'n2', x: 80, y: 180 });
    expect(rendered.get('n3')).toEqual({ id: 'n3', x: 80, y: 292 });
  });
});
