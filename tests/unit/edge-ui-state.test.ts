import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc } from '../../src/shared/graph';
import {
  applyEdgeUiSnapshot,
  cloneEdgeBendMap,
  cloneEdgeRouteMap,
  edgeUiSnapshotsEqual,
  emptyInteractionHistory,
  getEdgeUiSnapshot,
  pushInteractionPast,
  translateEdgeBendsForMovedNodes,
  translateEdgeRoutesForMovedNodes
} from '../../src/renderer/src/edge-ui-state';

function createTwoEdgeDoc() {
  let doc = createEmptyDoc();
  doc = addNode(doc, 'A');
  doc = addNode(doc, 'B');
  doc = addNode(doc, 'C');
  doc = addEdge(doc, 'n1', 'n2');
  doc = addEdge(doc, 'n2', 'n3');
  return doc;
}

describe('edge UI state helpers', () => {
  it('clones bend and route maps deeply', () => {
    const bends = { e1: { x: 10, y: 20 } };
    const routes = { e1: { points: [{ x: 1, y: 2 }] } };

    const bendClone = cloneEdgeBendMap(bends);
    const routeClone = cloneEdgeRouteMap(routes);
    bendClone.e1.x = 99;
    routeClone.e1.points[0].x = 99;

    expect(bends.e1.x).toBe(10);
    expect(routes.e1.points[0].x).toBe(1);
  });

  it('captures and reapplies snapshots without sharing nested route state', () => {
    const host = {
      edgeBendsByDirection: {
        horizontal: { e1: { x: 10, y: 20 } },
        vertical: {}
      },
      edgeRoutesByDirection: {
        horizontal: { e1: { points: [{ x: 1, y: 2 }] } },
        vertical: {}
      }
    };

    const snapshot = getEdgeUiSnapshot(host);
    host.edgeRoutesByDirection.horizontal.e1.points[0].x = 99;
    const restored = applyEdgeUiSnapshot(host, snapshot);

    expect(restored.edgeRoutesByDirection.horizontal.e1.points[0].x).toBe(1);
    expect(edgeUiSnapshotsEqual(snapshot, getEdgeUiSnapshot(restored))).toBe(true);
  });

  it('moves manual bends and routes only when both edge endpoints move', () => {
    const doc = createTwoEdgeDoc();
    const bends = {
      e1: { x: 10, y: 20 },
      e2: { x: 30, y: 40 }
    };
    const routes = {
      e1: { points: [{ x: 1, y: 2 }] },
      e2: { points: [{ x: 3, y: 4 }] }
    };

    expect(translateEdgeBendsForMovedNodes(doc, bends, new Set(['n1', 'n2']), 5, 7)).toEqual({
      e1: { x: 15, y: 27 }
    });
    expect(translateEdgeRoutesForMovedNodes(doc, routes, new Set(['n1', 'n2']), 5, 7)).toEqual({
      e1: { points: [{ x: 6, y: 9 }] }
    });
  });

  it('keeps interaction history bounded', () => {
    expect(emptyInteractionHistory()).toEqual({ past: [], future: [] });
    const past = [{ kind: 'doc' as const }, { kind: 'doc' as const }];

    expect(pushInteractionPast(past, { kind: 'doc' }, 2)).toEqual([{ kind: 'doc' }, { kind: 'doc' }]);
  });
});
