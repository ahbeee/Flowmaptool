import { describe, expect, it } from 'vitest';
import {
  computeAutoEdgeRoute,
  edgeIntersectsNodeCorridor,
  filterNodeBoxesByIds,
  getEdgeRenderEndpoints,
  getNodeCenter,
  getRouteSpacingOffsets,
  isForwardIncomingManualEdge,
  routeForwardIncomingConverge,
  routeFromSnappedDraggedControl
} from '../../src/renderer/src/edge-routing';
import type { FlowEdge } from '../../src/shared/graph';

const nodeSize = { width: 70, height: 28 };

describe('edge routing helpers', () => {
  it('calculates node centers and anchored render endpoints', () => {
    expect(getNodeCenter(10, 20, nodeSize)).toEqual({ x: 45, y: 34 });

    const edge: FlowEdge = {
      id: 'e1',
      from: 'n1',
      to: 'n2',
      anchors: { from: 'front', to: 'body' }
    };

    expect(
      getEdgeRenderEndpoints(edge, { x: 100, y: 40 }, { x: 0, y: 40 }, 'horizontal', nodeSize, nodeSize, false, false)
    ).toEqual({
      from: { x: 100, y: 54 },
      to: { x: 0, y: 54 }
    });
  });

  it('detects corridor obstacles and filters node boxes', () => {
    const boxes = new Map([
      ['n1', { left: -70, right: 0, top: -14, bottom: 14 }],
      ['n2', { left: 120, right: 190, top: -14, bottom: 14 }],
      ['n3', { left: 50, right: 80, top: -10, bottom: 10 }]
    ]);

    expect(edgeIntersectsNodeCorridor({ x: 0, y: 0 }, { x: 120, y: 0 }, 'horizontal', 'n1', 'n2', boxes)).toBe(true);
    expect([...filterNodeBoxesByIds(boxes, ['n2', 'missing']).keys()]).toEqual(['n2']);
  });

  it('routes automatic edges around obstacles and back edges', () => {
    const boxes = new Map([
      ['n1', { left: -70, right: 0, top: -14, bottom: 14 }],
      ['n2', { left: 120, right: 190, top: -14, bottom: 14 }],
      ['n3', { left: 48, right: 72, top: -20, bottom: 20 }]
    ]);

    const obstacleRoute = computeAutoEdgeRoute({ x: 0, y: 0 }, { x: 120, y: 0 }, 'horizontal', 'n1', 'n2', boxes);
    expect(obstacleRoute?.points.length).toBeGreaterThan(1);
    expect(obstacleRoute?.points.some(point => point.y < -20 || point.y > 20)).toBe(true);

    const backRoute = computeAutoEdgeRoute({ x: 120, y: 0 }, { x: 0, y: 0 }, 'horizontal', 'n2', 'n1', boxes);
    expect(backRoute?.points.length).toBeGreaterThan(1);
  });

  it('prefers the adjacent sibling gap for horizontal back edges', () => {
    const boxes = new Map([
      ['root', { left: 0, right: 140, top: 260, bottom: 328 }],
      ['above', { left: 620, right: 900, top: 120, bottom: 188 }],
      ['source', { left: 620, right: 740, top: 204, bottom: 272 }],
      ['below', { left: 620, right: 740, top: 344, bottom: 412 }]
    ]);

    const route = computeAutoEdgeRoute(
      { x: 740, y: 238 },
      { x: 0, y: 294 },
      'horizontal',
      'source',
      'root',
      boxes,
      0,
      { primary: 72, secondary: 48 },
      { from: 'back', to: 'front' }
    );

    expect(route?.points).toEqual([
      { x: 776, y: 238 },
      { x: 776, y: 308 },
      { x: -36, y: 308 },
      { x: -36, y: 294 }
    ]);
  });

  it('snaps dragged route controls to clear lanes', () => {
    const boxes = new Map([
      ['n1', { left: -70, right: 0, top: -14, bottom: 14 }],
      ['n2', { left: 120, right: 190, top: -14, bottom: 14 }],
      ['n3', { left: 50, right: 80, top: -10, bottom: 10 }]
    ]);

    const route = routeFromSnappedDraggedControl(
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      'horizontal',
      { x: 60, y: 8 },
      'n1',
      'n2',
      boxes,
      { primary: 48, secondary: 48 }
    );

    expect(route.points).toHaveLength(4);
    expect(Math.abs(route.points[1].y)).toBeGreaterThan(10);
    expect(Math.abs(route.points[2].y)).toBeGreaterThan(10);
  });

  it('identifies forward incoming manual edges and creates converge routes', () => {
    const edge: FlowEdge = { id: 'e3', from: 'n1', to: 'n2', role: 'manual' };
    expect(isForwardIncomingManualEdge(edge, { x: 0, y: 0 }, { x: 80, y: 30 }, 'horizontal', new Set())).toBe(true);
    expect(
      isForwardIncomingManualEdge(
        { ...edge, anchors: { from: 'front' } },
        { x: 0, y: 0 },
        { x: 80, y: 30 },
        'horizontal',
        new Set()
      )
    ).toBe(false);

    expect(routeForwardIncomingConverge({ x: 0, y: 10 }, { x: 100, y: 50 }, 'horizontal', 48)).toEqual({
      points: [
        { x: 68.8, y: 10 },
        { x: 68.8, y: 50 }
      ]
    });
    expect(getRouteSpacingOffsets({ primary: 10, secondary: 80 })).toEqual({ primary: 10, secondary: 40 });
  });
});
