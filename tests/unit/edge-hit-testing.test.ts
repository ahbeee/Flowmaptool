import { describe, expect, it } from 'vitest';
import type { FlowEdge } from '../../src/shared/graph';
import type { NodePosition, NodeSizeMap } from '../../src/shared/layout';
import { findEdgeHitAtPoint, type EdgeEndpointResolver } from '../../src/renderer/src/edge-hit-testing';

const nodeSize = { width: 70, height: 28 };
const nodeSizeMap: NodeSizeMap = {};
const endpointResolver: EdgeEndpointResolver = (_edge, fromPos, toPos, fromSize, toSize) => ({
  from: { x: fromPos.x + fromSize.width, y: fromPos.y + fromSize.height / 2 },
  to: { x: toPos.x, y: toPos.y + toSize.height / 2 }
});

function positions(entries: Array<[string, number, number]>): Map<string, NodePosition> {
  return new Map(entries.map(([id, x, y]) => [id, { id, x, y }]));
}

function hit(
  edges: FlowEdge[],
  point: { x: number; y: number },
  options: Partial<Parameters<typeof findEdgeHitAtPoint>[0]> = {}
) {
  return findEdgeHitAtPoint({
    edges,
    point,
    renderedPositionMap: positions([
      ['n1', 0, 0],
      ['n2', 160, 0],
      ['n3', 0, 4],
      ['n4', 160, 4]
    ]),
    nodeSizeMap,
    defaultNodeSize: nodeSize,
    layoutDirection: 'horizontal',
    layoutEdgeIds: new Set(),
    edgeRoutes: {},
    edgeBends: {},
    autoEdgeRouteMap: new Map(),
    edgeLaneMap: new Map(),
    edgeForceBendMap: new Map(),
    getRenderedEdgeEndpoints: endpointResolver,
    ...options
  });
}

describe('edge hit testing helpers', () => {
  it('returns the closest edge within the hit radius and ignores distant points', () => {
    const edges: FlowEdge[] = [{ id: 'e1', from: 'n1', to: 'n2' }];

    expect(hit(edges, { x: 100, y: 14 })?.edgeId).toBe('e1');
    expect(hit(edges, { x: 100, y: 80 })).toBeNull();
  });

  it('uses the preferred edge when it is close enough', () => {
    const edges: FlowEdge[] = [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n1', to: 'n2', role: 'manual' }
    ];

    expect(hit(edges, { x: 100, y: 14 }, { preferredEdgeId: 'e2' })?.edgeId).toBe('e2');
  });

  it('prioritizes nearby layout edges over non-layout preferred or closer routed edges', () => {
    const edges: FlowEdge[] = [
      { id: 'e-layout', from: 'n1', to: 'n2' },
      { id: 'e-manual', from: 'n3', to: 'n4', role: 'manual' }
    ];
    const layoutEdgeIds = new Set(['e-layout']);

    expect(hit(edges, { x: 100, y: 16 }, { layoutEdgeIds, preferredEdgeId: 'e-manual' })?.edgeId).toBe('e-layout');
    expect(hit(edges, { x: 100, y: 18 }, { layoutEdgeIds })?.edgeId).toBe('e-layout');
  });

  it('hits explicit routed edge paths', () => {
    const edges: FlowEdge[] = [{ id: 'e1', from: 'n1', to: 'n2', role: 'manual' }];

    expect(
      hit(edges, { x: 110, y: 74 }, { edgeRoutes: { e1: { points: [{ x: 110, y: 74 }, { x: 160, y: 74 }] } } })?.edgeId
    ).toBe('e1');
  });
});
