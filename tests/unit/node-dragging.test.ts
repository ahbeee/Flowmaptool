import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, type FlowDoc } from '../../src/shared/graph';
import type { NodePosition, NodeSizeMap } from '../../src/shared/layout';
import {
  applyPreservedComponentOffsetToNodeOffsets,
  applyNodeDragToHost,
  buildNodeDragStartState,
  buildNodeReparentDragResult,
  hasNodeDragExceededThreshold,
  planNodeDragFinish,
  restoreDetachedNodeDragToHost,
  type NodeDragHost,
  type NodeDragStateSnapshot
} from '../../src/renderer/src/node-dragging';

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
  it('builds root drag start state for the connected layout component', () => {
    const state = buildNodeDragStartState({
      doc: createDoc(),
      nodeId: 'n1',
      startPoint: { x: 10, y: 20 },
      nodeOffsets: { n1: { dx: 1, dy: 2 }, n2: { dx: 3, dy: 4 } },
      edgeBends: { e1: { x: 100, y: 120 } },
      edgeRoutes: { e1: { points: [{ x: 100, y: 120 }] } },
      rootNodeIds: new Set(['n1', 'n3']),
      layoutEdgeIds: new Set(['e1'])
    });

    expect(state).toEqual({
      nodeIds: ['n1', 'n2'],
      anchorNodeId: 'n1',
      startX: 10,
      startY: 20,
      startOffsets: { n1: { dx: 1, dy: 2 }, n2: { dx: 3, dy: 4 } },
      startEdgeBends: { e1: { x: 100, y: 120 } },
      startEdgeRoutes: { e1: { points: [{ x: 100, y: 120 }] } }
    });
  });

  it('builds non-root drag start state for only the dragged node', () => {
    const state = buildNodeDragStartState({
      doc: createDoc(),
      nodeId: 'n2',
      startPoint: { x: 10, y: 20 },
      nodeOffsets: { n1: { dx: 1, dy: 2 }, n2: { dx: 3, dy: 4 } },
      edgeBends: {},
      edgeRoutes: {},
      rootNodeIds: new Set(['n1', 'n3']),
      layoutEdgeIds: new Set(['e1'])
    });

    expect(state.nodeIds).toEqual(['n2']);
    expect(state.startOffsets).toEqual({ n2: { dx: 3, dy: 4 } });
  });

  it('detects whether pointer movement has exceeded the drag threshold', () => {
    const state = dragState({ startX: 10, startY: 10 });

    expect(hasNodeDragExceededThreshold(state, { x: 12, y: 12 })).toBe(false);
    expect(hasNodeDragExceededThreshold(state, { x: 13, y: 10 })).toBe(true);
  });

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

  it('restores original offsets and edge UI for detached non-root drags', () => {
    const result = restoreDetachedNodeDragToHost(
      {
        ...host(),
        nodeOffsetsByDirection: {
          horizontal: { n1: { dx: 30, dy: 10 }, n2: { dx: 40, dy: 20 } },
          vertical: {}
        },
        edgeBendsByDirection: { horizontal: { e1: { x: 200, y: 120 } }, vertical: {} },
        edgeRoutesByDirection: { horizontal: { e1: { points: [{ x: 200, y: 120 }] } }, vertical: {} }
      },
      dragState({
        nodeIds: ['n1', 'n2'],
        startOffsets: { n1: { dx: 5, dy: 6 }, n2: { dx: 0, dy: 0 } },
        startEdgeBends: { e1: { x: 120, y: 90 } },
        startEdgeRoutes: { e1: { points: [{ x: 120, y: 90 }] } }
      })
    );

    expect(result.nodeOffsetsByDirection.horizontal).toEqual({ n1: { dx: 5, dy: 6 } });
    expect(result.edgeBendsByDirection.horizontal).toEqual({ e1: { x: 120, y: 90 } });
    expect(result.edgeRoutesByDirection.horizontal).toEqual({ e1: { points: [{ x: 120, y: 90 }] } });
  });

  it('builds reparent drag result with preserved root component offset', () => {
    const result = buildNodeReparentDragResult({
      doc: createDoc(),
      movingNodeId: 'n2',
      dropParentTargetId: 'n3',
      anchorRootId: 'n1',
      renderedPositionMap: new Map([['n1', { id: 'n1', x: 200, y: 210 }]]),
      layoutDirection: 'horizontal',
      nodeSizeMap: {},
      layoutSpacing: { primary: 56, secondary: 76 }
    });

    expect(result.doc.edges).toContainEqual(expect.objectContaining({ from: 'n3', to: 'n2' }));
    expect(result.preservedComponentOffset).toEqual({
      nodeIds: ['n1'],
      offset: { dx: 120, dy: 130 }
    });
  });

  it('returns no preserved offset when the anchor root was not rendered before reparenting', () => {
    const result = buildNodeReparentDragResult({
      doc: createDoc(),
      movingNodeId: 'n2',
      dropParentTargetId: 'n3',
      anchorRootId: 'n1',
      renderedPositionMap: new Map(),
      layoutDirection: 'horizontal',
      nodeSizeMap: {},
      layoutSpacing: { primary: 56, secondary: 76 }
    });

    expect(result.doc.edges).toContainEqual(expect.objectContaining({ from: 'n3', to: 'n2' }));
    expect(result.preservedComponentOffset).toBeNull();
  });

  it('plans drag finish as reparent, restore, or keep-root based on drop target and root status', () => {
    const common = {
      doc: createDoc(),
      renderedPositionMap: new Map([['n1', { id: 'n1', x: 200, y: 210 }]]),
      layoutDirection: 'horizontal' as const,
      nodeSizeMap: {} as NodeSizeMap,
      layoutSpacing: { primary: 56, secondary: 76 }
    };

    const reparent = planNodeDragFinish({
      ...common,
      dragState: dragState({ nodeIds: ['n2'], anchorNodeId: 'n2' }),
      dropParentTargetId: 'n3',
      rootNodeIds: new Set(['n1', 'n3']),
      primaryRootNodeId: 'n1'
    });
    expect(reparent.type).toBe('reparent');
    expect(reparent.type === 'reparent' ? reparent.result.movingNodeId : '').toBe('n2');

    expect(
      planNodeDragFinish({
        ...common,
        dragState: dragState({ nodeIds: ['n2'], anchorNodeId: 'n2' }),
        dropParentTargetId: null,
        rootNodeIds: new Set(['n1', 'n3']),
        primaryRootNodeId: 'n1'
      })
    ).toEqual({ type: 'restore-detached' });

    expect(
      planNodeDragFinish({
        ...common,
        dragState: dragState({ nodeIds: ['n1', 'n2'], anchorNodeId: 'n1' }),
        dropParentTargetId: 'n3',
        rootNodeIds: new Set(['n1', 'n3']),
        primaryRootNodeId: 'n1'
      })
    ).toEqual({ type: 'root-drag' });
  });

  it('applies preserved component offsets and removes zero offsets', () => {
    expect(
      applyPreservedComponentOffsetToNodeOffsets(
        { n1: { dx: 8, dy: 9 }, n2: { dx: 1, dy: 2 } },
        { nodeIds: ['n1', 'n3'], offset: { dx: 0, dy: 0 } }
      )
    ).toEqual({ n2: { dx: 1, dy: 2 } });

    expect(
      applyPreservedComponentOffsetToNodeOffsets(
        { n1: { dx: 8, dy: 9 } },
        { nodeIds: ['n1', 'n3'], offset: { dx: 12, dy: 14 } }
      )
    ).toEqual({ n1: { dx: 12, dy: 14 }, n3: { dx: 12, dy: 14 } });
  });
});
