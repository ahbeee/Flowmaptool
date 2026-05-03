import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, type FlowDoc } from '../../src/shared/graph';
import type { NodePosition, NodeSizeMap } from '../../src/shared/layout';
import { applyNodeDragToHost, type NodeDragHost, type NodeDragStateSnapshot } from '../../src/renderer/src/node-dragging';

const defaultNodeSize = { width: 70, height: 28 };
function createDoc(): FlowDoc {
  let doc = createEmptyDoc();
  doc = addNode(doc, 'Root');
  doc = addNode(doc, 'Child');
  doc = addNode(doc, 'Other root');
  doc = addEdge(doc, 'n1', 'n2');
  return doc;
}

function host(): NodeDragHost {
  return {
    layoutDirection: 'horizontal',
    nodeOffsetsByDirection: { horizontal: {}, vertical: {} },
    edgeBendsByDirection: { horizontal: {}, vertical: {} },
    edgeRoutesByDirection: { horizontal: {}, vertical: {} }
  };
}

function dragState(patch: Partial<NodeDragStateSnapshot> = {}): NodeDragStateSnapshot {
  return {
    nodeIds: ['n1'],
    anchorNodeId: 'n1',
    startX: 80,
    startY: 80,
    startOffsets: { n1: { dx: 0, dy: 0 } },
    startEdgeBends: {},
    startEdgeRoutes: {},
    ...patch
  };
}

const basePositions: NodePosition[] = [
  { id: 'n1', x: 80, y: 80 },
  { id: 'n2', x: 220, y: 80 },
  { id: 'n3', x: 82, y: 180 }
];

describe('node dragging helpers', () => {
  it('applies drag deltas to selected node offsets', () => {
    const result = applyNodeDragToHost(host(), {
      doc: createDoc(),
      dragState: dragState(),
      pointer: { x: 110, y: 95 },
      basePositions,
      rootNodeIds: new Set(['n1']),
      nodeSizeMap: {},
      defaultNodeSize
    });

    expect(result.nodeOffsetsByDirection.horizontal.n1).toEqual({ dx: 30, dy: 15 });
  });

  it('snaps dragged roots to nearby root centers', () => {
    const result = applyNodeDragToHost(host(), {
      doc: createDoc(),
      dragState: dragState(),
      pointer: { x: 82, y: 130 },
      basePositions: [
        { id: 'n1', x: 80, y: 80 },
        { id: 'n2', x: 220, y: 80 },
        { id: 'n3', x: 82, y: 250 }
      ],
      rootNodeIds: new Set(['n1', 'n3']),
      nodeSizeMap: {},
      defaultNodeSize
    });

    expect(result.nodeOffsetsByDirection.horizontal.n1).toEqual({ dx: 2, dy: 50 });
  });

  it('blocks movement when the dragged node would overlap static nodes', () => {
    const initial = host();
    const result = applyNodeDragToHost(initial, {
      doc: createDoc(),
      dragState: dragState(),
      pointer: { x: 220, y: 80 },
      basePositions,
      rootNodeIds: new Set(['n1']),
      nodeSizeMap: {},
      defaultNodeSize
    });

    expect(result).toBe(initial);
  });

  it('translates edge UI when both endpoints move and clears it when only one endpoint moves', () => {
    const doc = createDoc();
    const initial = {
      ...host(),
      edgeBendsByDirection: { horizontal: { e1: { x: 120, y: 110 } }, vertical: {} },
      edgeRoutesByDirection: { horizontal: { e1: { points: [{ x: 120, y: 110 }] } }, vertical: {} }
    };

    const movedTogether = applyNodeDragToHost(initial, {
      doc,
      dragState: dragState({
        nodeIds: ['n1', 'n2'],
        startOffsets: { n1: { dx: 0, dy: 0 }, n2: { dx: 0, dy: 0 } },
        startEdgeBends: initial.edgeBendsByDirection.horizontal,
        startEdgeRoutes: initial.edgeRoutesByDirection.horizontal
      }),
      pointer: { x: 90, y: 100 },
      basePositions,
      rootNodeIds: new Set(['n1']),
      nodeSizeMap: {},
      defaultNodeSize
    });
    expect(movedTogether.edgeBendsByDirection.horizontal.e1).toEqual({ x: 130, y: 130 });
    expect(movedTogether.edgeRoutesByDirection.horizontal.e1).toEqual({ points: [{ x: 130, y: 130 }] });

    const movedOneEndpoint = applyNodeDragToHost(initial, {
      doc,
      dragState: dragState({
        startEdgeBends: initial.edgeBendsByDirection.horizontal,
        startEdgeRoutes: initial.edgeRoutesByDirection.horizontal
      }),
      pointer: { x: 90, y: 100 },
      basePositions,
      rootNodeIds: new Set(['n1']),
      nodeSizeMap: {},
      defaultNodeSize
    });
    expect(movedOneEndpoint.edgeBendsByDirection.horizontal).toEqual({});
    expect(movedOneEndpoint.edgeRoutesByDirection.horizontal).toEqual({});
  });
});
