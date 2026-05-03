import { describe, expect, it } from 'vitest';
import {
  compactRoutePoints,
  distanceToPathSquared,
  edgeMidpoint,
  edgePath,
  routeControlPoint,
  routeFromBend,
  roundedRoutePath,
  shouldBendEdge
} from '../../src/renderer/src/edge-path';

const nodeSize = { width: 70, height: 28 };

describe('edge path helpers', () => {
  it('uses straight paths when endpoints are aligned and curved paths when they are offset', () => {
    expect(shouldBendEdge({ x: 0, y: 0 }, { x: 100, y: 1 }, 'horizontal', nodeSize, nodeSize)).toBe(false);
    expect(shouldBendEdge({ x: 0, y: 0 }, { x: 100, y: 10 }, 'horizontal', nodeSize, nodeSize)).toBe(true);
    expect(edgePath({ x: 0, y: 0 }, { x: 100, y: 1 }, 0, 'horizontal', nodeSize, nodeSize)).toBe('M 0 0 L 100 1');
    expect(edgePath({ x: 0, y: 0 }, { x: 100, y: 10 }, 0, 'horizontal', nodeSize, nodeSize)).toContain(' C ');
  });

  it('renders manual bend and orthogonal route paths', () => {
    expect(edgePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 'horizontal', nodeSize, nodeSize, false, routeFromBend({ x: 50, y: 30 }))).toBe(
      'M 0 0 Q 50 30 100 0'
    );
    expect(roundedRoutePath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }])).toBe(
      'M 0 0 L 25 0 Q 50 0 50 25 L 50 25 Q 50 50 75 50 L 100 50'
    );
  });

  it('finds route midpoints by path length', () => {
    expect(edgeMidpoint({ x: 0, y: 0 }, { x: 100, y: 50 })).toEqual({ x: 50, y: 25 });
    expect(routeControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] })).toEqual({
      x: 50,
      y: 50
    });
  });

  it('compacts nearly duplicate points and measures SVG path distance', () => {
    expect(compactRoutePoints([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 20, y: 0 }])).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 }
    ]);
    expect(distanceToPathSquared({ x: 5, y: 3 }, 'M 0 0 L 10 0')).toBe(9);
    expect(distanceToPathSquared({ x: 50, y: 20 }, 'M 0 0 Q 50 40 100 0')).toBeLessThan(25);
  });
});
