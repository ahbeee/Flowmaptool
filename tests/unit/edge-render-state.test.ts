import { describe, expect, it } from 'vitest';
import type { FlowEdge, NodeId } from '../../src/shared/graph';
import type { NodePosition, NodeSize, NodeSizeMap } from '../../src/shared/layout';
import {
  buildAutoEdgeRouteMap,
  buildEdgeForceBendMap,
  buildEdgeLaneMap,
  type RenderedEdgeEndpointResolver
} from '../../src/renderer/src/edge-render-state';
import type { NodeBox } from '../../src/renderer/src/routing-geometry';

const nodeSize: NodeSize = { width: 70, height: 28 };
const nodeSizeMap: NodeSizeMap = {};
const endpointResolver: RenderedEdgeEndpointResolver = (_edge, fromPos, toPos, fromSize, toSize) => ({
  from: { x: fromPos.x + fromSize.width, y: fromPos.y + fromSize.height / 2 },
  to: { x: toPos.x, y: toPos.y + toSize.height / 2 }
});

function positions(entries: Array<[NodeId, number, number]>): Map<NodeId, NodePosition> {
  return new Map(entries.map(([id, x, y]) => [id, { id, x, y }]));
}

function boxes(entries: Array<[NodeId, NodeBox]>): Map<NodeId, NodeBox> {
  return new Map(entries);
}

describe('edge render state helpers', () => {
  it('marks forced bends for non-layout edges and layout edges with corridor obstacles', () => {
    const edges: FlowEdge[] = [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n1', role: 'manual' }
    ];
    const renderedPositionMap = positions([
      ['n1', 0, 0],
      ['n2', 160, 0],
      ['n3', 90, 0]
    ]);
    const routeBoxes = boxes([
      ['n1', { left: 0, right: 70, top: 0, bottom: 28 }],
      ['n2', { left: 160, right: 230, top: 0, bottom: 28 }],
      ['n3', { left: 90, right: 120, top: -10, bottom: 38 }]
    ]);

    const forceBends = buildEdgeForceBendMap({
      edges,
      renderedPositionMap,
      nodeSizeMap,
      layoutDirection: 'horizontal',
      layoutEdgeIds: new Set(['e1']),
      useAdvancedAutoRouting: true,
      getRenderedEdgeEndpoints: endpointResolver,
      getRouteNodeBoxes: () => routeBoxes,
      defaultNodeSize: nodeSize
    });

    expect(forceBends.get('e1')).toBe(true);
    expect(forceBends.get('e2')).toBe(true);
  });

  it('keeps fixed-routing layout edges straight when advanced routing is disabled', () => {
    const forceBends = buildEdgeForceBendMap({
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
      renderedPositionMap: positions([
        ['n1', 0, 0],
        ['n2', 160, 0]
      ]),
      nodeSizeMap,
      layoutDirection: 'horizontal',
      layoutEdgeIds: new Set(['e1']),
      useAdvancedAutoRouting: false,
      getRenderedEdgeEndpoints: endpointResolver,
      getRouteNodeBoxes: () => new Map(),
      defaultNodeSize: nodeSize
    });

    expect(forceBends.get('e1')).toBe(false);
  });

  it('assigns stable lanes to bent edges from the same source', () => {
    const edges: FlowEdge[] = [
      { id: 'e-b', from: 'n1', to: 'n3' },
      { id: 'e-a', from: 'n1', to: 'n2' }
    ];
    const lanes = buildEdgeLaneMap({
      edges,
      renderedPositionMap: positions([
        ['n1', 0, 0],
        ['n2', 160, 20],
        ['n3', 160, 80]
      ]),
      nodeSizeMap,
      edgeForceBendMap: new Map(edges.map(edge => [edge.id, true])),
      layoutDirection: 'horizontal',
      getRenderedEdgeEndpoints: endpointResolver,
      defaultNodeSize: nodeSize
    });

    expect(lanes.get('e-a')).toBe(0);
    expect(lanes.get('e-b')).toBe(1);
  });

  it('builds automatic routes, converges multiple forward incoming manual edges, and skips explicit routes', () => {
    const edges: FlowEdge[] = [
      { id: 'e1', from: 'n1', to: 'n3', role: 'manual' },
      { id: 'e2', from: 'n2', to: 'n3', role: 'manual' },
      { id: 'e3', from: 'n3', to: 'n1', role: 'manual' }
    ];

    const routes = buildAutoEdgeRouteMap({
      edges,
      renderedPositionMap: positions([
        ['n1', 0, 0],
        ['n2', 0, 80],
        ['n3', 180, 40]
      ]),
      nodeSizeMap,
      edgeRoutes: { e3: { points: [{ x: 1, y: 1 }] } },
      edgeBends: {},
      edgeForceBendMap: new Map(edges.map(edge => [edge.id, true])),
      edgeLaneMap: new Map(),
      layoutDirection: 'horizontal',
      layoutEdgeIds: new Set(),
      layoutSpacing: { primary: 48, secondary: 48 },
      convergePrimarySpacing: 48,
      useAdvancedAutoRouting: true,
      getRenderedEdgeEndpoints: endpointResolver,
      getRouteNodeBoxes: () => new Map(),
      defaultNodeSize: nodeSize
    });

    expect(routes.get('e1')?.points).toHaveLength(2);
    expect(routes.get('e2')?.points).toHaveLength(2);
    expect(routes.has('e3')).toBe(false);
  });
});
