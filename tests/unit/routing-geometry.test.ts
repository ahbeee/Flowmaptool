import { describe, expect, it } from 'vitest';
import {
  distanceToSegmentSquared,
  routeClearancePenalty,
  routeObstacleCount,
  routeTurnCount,
  segmentIntersectsBox,
  segmentsIntersect
} from '../../src/renderer/src/routing-geometry';

describe('routing geometry helpers', () => {
  it('detects segment intersections and box crossings', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
    expect(segmentIntersectsBox({ x: 0, y: 5 }, { x: 20, y: 5 }, { left: 8, right: 12, top: 2, bottom: 8 }, 0)).toBe(true);
  });

  it('scores route obstacles and clearance', () => {
    const boxes = new Map([
      ['source', { left: -10, right: 0, top: -10, bottom: 10 }],
      ['target', { left: 100, right: 110, top: -10, bottom: 10 }],
      ['obstacle', { left: 40, right: 60, top: -10, bottom: 10 }]
    ]);

    const through = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ];
    const around = [
      { x: 0, y: 40 },
      { x: 100, y: 40 }
    ];

    expect(routeObstacleCount(through, 'source', 'target', boxes)).toBe(1);
    expect(routeObstacleCount(around, 'source', 'target', boxes)).toBe(0);
    expect(routeClearancePenalty(through, 'source', 'target', boxes)).toBeGreaterThan(routeClearancePenalty(around, 'source', 'target', boxes));
  });

  it('measures path distance and turns', () => {
    expect(distanceToSegmentSquared({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(25);
    expect(routeTurnCount([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe(1);
  });
});
