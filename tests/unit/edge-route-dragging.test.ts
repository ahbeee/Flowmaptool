import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, type FlowDoc, type FlowEdge } from '../../src/shared/graph';
import type { LayoutDirection, NodePosition, NodeSize } from '../../src/shared/layout';
import {
  applyDraggedEdgeRouteToHost,
  buildDraggedEdgeRoute,
  hasEdgeSegmentDragExceededThreshold,
  planEdgeSegmentDragFinish,
  planEdgeSegmentDragMove,
  type EdgeRouteDragHost
} from '../../src/renderer/src/edge-route-dragging';
import { getEdgeRenderEndpoints } from '../../src/renderer/src/edge-routing';

const defaultNodeSize = { width: 70, height: 28 };

function createDoc(): FlowDoc {
  let doc = createEmptyDoc();
  doc = addNode(doc, 'A');
  doc = addNode(doc, 'B');
  doc = addEdge(doc, 'n1', 'n2');
  return doc;
}

function host(direction: LayoutDirection = 'horizontal'): EdgeRouteDragHost {
  return {
    layoutDirection: direction,
    edgeBendsByDirection: { horizontal: {}, vertical: {} },
    edgeRoutesByDirection: { horizontal: {}, vertical: {} }
  };
}

function getHorizontalEndpoints(
  edge: FlowEdge,
  fromPos: NodePosition,
  toPos: NodePosition,
  fromSize: NodeSize,
  toSize: NodeSize
) {
  return getEdgeRenderEndpoints(edge, fromPos, toPos, 'horizontal', fromSize, toSize, true, false);
}

describe('edge route dragging helpers', () => {
  it('plans segment drag movement only after the pointer passes the threshold', () => {
    const start = { x: 10, y: 10 };

    expect(hasEdgeSegmentDragExceededThreshold(start, { x: 12, y: 11 })).toBe(false);
    expect(hasEdgeSegmentDragExceededThreshold(start, { x: 14, y: 10 })).toBe(true);
    expect(planEdgeSegmentDragMove(start, { x: 12, y: 11 }, false)).toEqual({ type: 'ignore' });
    expect(planEdgeSegmentDragMove(start, { x: 12, y: 11 }, true)).toEqual({
      type: 'drag',
      didDrag: true,
      suppressNextEdgeClick: true
    });
    expect(planEdgeSegmentDragMove(start, { x: 14, y: 10 }, false)).toEqual({
      type: 'drag',
      didDrag: true,
      suppressNextEdgeClick: true
    });
  });

  it('plans segment drag finish with snapshot commit only after dragging', () => {
    expect(planEdgeSegmentDragFinish('e1', false)).toEqual({
      selectedEdgeId: 'e1',
      shouldCommitSnapshot: false
    });
    expect(planEdgeSegmentDragFinish('e1', true)).toEqual({
      selectedEdgeId: 'e1',
      shouldCommitSnapshot: true
    });
  });

  it('builds a dragged route from rendered endpoints and pointer lane', () => {
    const doc = createDoc();
    const route = buildDraggedEdgeRoute({
      doc,
      edgeId: 'e1',
      pointer: { x: 80, y: 80 },
      renderedPositionMap: new Map([
        ['n1', { id: 'n1', x: 0, y: 0 }],
        ['n2', { id: 'n2', x: 160, y: 0 }]
      ]),
      nodeSizeMap: {},
      defaultNodeSize,
      layoutDirection: 'horizontal',
      layoutSpacing: { primary: 48, secondary: 48 },
      getRouteNodeBoxes: () =>
        new Map([
          ['n1', { left: 0, right: 70, top: 0, bottom: 28 }],
          ['n2', { left: 160, right: 230, top: 0, bottom: 28 }],
          ['n3', { left: 100, right: 130, top: 40, bottom: 68 }]
        ]),
      getRenderedEdgeEndpoints: getHorizontalEndpoints
    });

    expect(route?.points.length).toBeGreaterThanOrEqual(2);
    expect(route?.points.some(point => point.y !== 14)).toBe(true);
  });

  it('returns no dragged route when the edge or endpoint positions are missing', () => {
    const doc = createDoc();
    const base = {
      doc,
      pointer: { x: 80, y: 80 },
      renderedPositionMap: new Map([['n1', { id: 'n1', x: 0, y: 0 }]]),
      nodeSizeMap: {},
      defaultNodeSize,
      layoutDirection: 'horizontal' as const,
      layoutSpacing: { primary: 48, secondary: 48 },
      getRouteNodeBoxes: () => new Map(),
      getRenderedEdgeEndpoints: getHorizontalEndpoints
    };

    expect(buildDraggedEdgeRoute({ ...base, edgeId: 'missing' })).toBeUndefined();
    expect(buildDraggedEdgeRoute({ ...base, edgeId: 'e1' })).toBeUndefined();
  });

  it('applies a dragged route to the active layout direction and removes the old bend', () => {
    const initial: EdgeRouteDragHost = {
      ...host('vertical'),
      edgeBendsByDirection: {
        horizontal: { e1: { x: 1, y: 2 } },
        vertical: { e1: { x: 3, y: 4 }, e2: { x: 5, y: 6 } }
      },
      edgeRoutesByDirection: {
        horizontal: { e1: { points: [{ x: 1, y: 2 }] } },
        vertical: {}
      }
    };

    const route = { points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] };
    const result = applyDraggedEdgeRouteToHost(initial, 'e1', route);

    expect(result.edgeBendsByDirection.horizontal).toEqual({ e1: { x: 1, y: 2 } });
    expect(result.edgeBendsByDirection.vertical).toEqual({ e2: { x: 5, y: 6 } });
    expect(result.edgeRoutesByDirection.vertical.e1).toBe(route);
  });
});
