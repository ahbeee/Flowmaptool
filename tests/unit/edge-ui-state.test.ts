import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc } from '../../src/shared/graph';
import { commitHistory, createHistory } from '../../src/shared/history';
import {
  applyEdgeUiSnapshot,
  clearEdgeUiForLayoutMutation,
  cloneEdgeBendMap,
  cloneEdgeRouteMap,
  commitDocHistoryToHost,
  commitCurrentEdgeUiSnapshotToHost,
  commitEdgeUiChangeToHost,
  edgeUiSnapshotsEqual,
  emptyInteractionHistory,
  getEdgeUiSnapshot,
  pushInteractionPast,
  redoInteractionInHost,
  translateEdgeBendsForMovedNodes,
  translateEdgeRoutesForMovedNodes,
  undoInteractionInHost
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

  it('clears explicit edge UI when layout-affecting document state changes', () => {
    const doc = createTwoEdgeDoc();
    const host = {
      edgeBendsByDirection: { horizontal: { e1: { x: 10, y: 20 } }, vertical: {} },
      edgeRoutesByDirection: { horizontal: { e2: { points: [{ x: 30, y: 40 }] } }, vertical: {} }
    };

    expect(
      clearEdgeUiForLayoutMutation(host, doc, {
        ...doc,
        settings: {
          ...doc.settings,
          spacing: { ...doc.settings.spacing, vertical: doc.settings.spacing.vertical + 12 }
        }
      })
    ).toEqual({
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} }
    });

    expect(
      clearEdgeUiForLayoutMutation(host, doc, {
        ...doc,
        nodes: doc.nodes.map(node =>
          node.id === 'n2'
            ? { ...node, task: { enabled: true, done: false, status: 'inbox', priority: 'normal', progress: 50 } }
            : node
        )
      })
    ).toBe(host);
  });

  it('preserves unchanged edge UI when unrelated manual edges are added', () => {
    const doc = createTwoEdgeDoc();
    const host = {
      edgeBendsByDirection: { horizontal: { e1: { x: 10, y: 20 } }, vertical: {} },
      edgeRoutesByDirection: { horizontal: { e2: { points: [{ x: 30, y: 40 }] } }, vertical: {} }
    };
    const nextDoc = addEdge(doc, 'n3', 'n1', 'manual', { from: 'back', to: 'front' });

    expect(clearEdgeUiForLayoutMutation(host, doc, nextDoc)).toBe(host);
  });

  it('prunes edge UI only for removed or changed edges when node layout is unchanged', () => {
    const doc = addEdge(createTwoEdgeDoc(), 'n3', 'n1', 'manual', { from: 'back', to: 'front' });
    const host = {
      edgeBendsByDirection: { horizontal: { e1: { x: 10, y: 20 } }, vertical: {} },
      edgeRoutesByDirection: { horizontal: { e3: { points: [{ x: 30, y: 40 }] } }, vertical: {} }
    };
    const nextDoc = {
      ...doc,
      edges: doc.edges.map(edge => (edge.id === 'e3' ? { ...edge, anchors: { from: 'front' as const } } : edge))
    };

    expect(clearEdgeUiForLayoutMutation(host, doc, nextDoc)).toEqual({
      edgeBendsByDirection: { horizontal: { e1: { x: 10, y: 20 } }, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} }
    });
  });

  it('prunes only affected edge UI for node layout mutations when affected edges are known', () => {
    const doc = createTwoEdgeDoc();
    const host = {
      edgeBendsByDirection: { horizontal: { e1: { x: 10, y: 20 } }, vertical: {} },
      edgeRoutesByDirection: { horizontal: { e2: { points: [{ x: 30, y: 40 }] } }, vertical: {} }
    };
    const nextDoc = {
      ...doc,
      nodes: doc.nodes.map(node => (node.id === 'n3' ? { ...node, label: 'A longer label' } : node))
    };

    expect(clearEdgeUiForLayoutMutation(host, doc, nextDoc, { affectedEdgeIds: new Set(['e2']) })).toEqual({
      edgeBendsByDirection: { horizontal: { e1: { x: 10, y: 20 } }, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} }
    });
  });

  it('keeps interaction history bounded', () => {
    expect(emptyInteractionHistory()).toEqual({ past: [], future: [] });
    const past = [{ kind: 'doc' as const }, { kind: 'doc' as const }];

    expect(pushInteractionPast(past, { kind: 'doc' }, 2)).toEqual([{ kind: 'doc' }, { kind: 'doc' }]);
  });

  it('commits edge UI changes into interaction history only when snapshots change', () => {
    const doc = createTwoEdgeDoc();
    const host = {
      history: createHistory(doc),
      isDirty: false,
      interactionHistory: emptyInteractionHistory(),
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} }
    };

    const unchanged = commitEdgeUiChangeToHost(host, snapshot => snapshot, 'horizontal');
    expect(unchanged).toBe(host);

    const changed = commitEdgeUiChangeToHost(
      host,
      snapshot => ({
        ...snapshot,
        edgeBendsByDirection: {
          ...snapshot.edgeBendsByDirection,
          horizontal: { e1: { x: 10, y: 20 } }
        }
      }),
      'horizontal'
    );
    expect(changed.isDirty).toBe(true);
    expect(changed.edgeBendsByDirection.horizontal).toEqual({ e1: { x: 10, y: 20 } });
    expect(changed.interactionHistory.past).toHaveLength(1);
    expect(changed.interactionHistory.future).toEqual([]);
  });

  it('commits the current edge UI snapshot after drag changes', () => {
    const doc = createTwoEdgeDoc();
    const host = {
      history: createHistory(doc),
      isDirty: false,
      interactionHistory: emptyInteractionHistory(),
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} }
    };
    const before = getEdgeUiSnapshot(host);
    const afterDrag = {
      ...host,
      edgeRoutesByDirection: {
        horizontal: { e1: { points: [{ x: 1, y: 2 }] } },
        vertical: {}
      }
    };

    expect(commitCurrentEdgeUiSnapshotToHost(afterDrag, null)).toBe(afterDrag);
    const committed = commitCurrentEdgeUiSnapshotToHost(afterDrag, before);
    expect(committed.isDirty).toBe(true);
    expect(committed.interactionHistory.past).toEqual([{ kind: 'edge-ui', snapshot: before }]);
  });

  it('undoes and redoes edge UI interaction history entries', () => {
    const doc = createTwoEdgeDoc();
    const clean = {
      history: createHistory(doc),
      isDirty: false,
      interactionHistory: emptyInteractionHistory(),
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} }
    };
    const before = getEdgeUiSnapshot(clean);
    const changed = commitEdgeUiChangeToHost(
      clean,
      snapshot => ({
        ...snapshot,
        edgeBendsByDirection: {
          ...snapshot.edgeBendsByDirection,
          horizontal: { e1: { x: 10, y: 20 } }
        }
      }),
      'horizontal'
    );

    const undone = undoInteractionInHost(changed);
    expect(getEdgeUiSnapshot(undone)).toEqual(before);
    expect(undone.interactionHistory.past).toEqual([]);
    expect(undone.interactionHistory.future).toHaveLength(1);

    const redone = redoInteractionInHost(undone);
    expect(redone.edgeBendsByDirection.horizontal).toEqual({ e1: { x: 10, y: 20 } });
    expect(redone.interactionHistory.past).toHaveLength(1);
    expect(redone.interactionHistory.future).toEqual([]);
  });

  it('falls back to document history when no interaction entries exist', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    const nextDoc = addNode(doc, 'B');
    const host = {
      history: commitHistory(createHistory(doc), nextDoc),
      isDirty: false,
      interactionHistory: emptyInteractionHistory(),
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} }
    };

    const undone = undoInteractionInHost(host);
    expect(undone.history.present.nodes).toHaveLength(1);
    expect(undone.isDirty).toBe(true);

    const redone = redoInteractionInHost(undone);
    expect(redone.history.present.nodes).toHaveLength(2);
  });

  it('commits document history entries into the shared interaction stack', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    const nextDoc = addNode(doc, 'B');
    const host = {
      history: createHistory(doc),
      isDirty: false,
      interactionHistory: emptyInteractionHistory(),
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} }
    };
    const nextHistory = commitHistory(host.history, nextDoc);

    const committed = commitDocHistoryToHost(host, nextHistory);

    expect(committed.history.present.nodes).toHaveLength(2);
    expect(committed.isDirty).toBe(true);
    expect(committed.interactionHistory).toEqual({ past: [{ kind: 'doc' }], future: [] });
    expect(commitDocHistoryToHost(host, host.history).interactionHistory).toBe(host.interactionHistory);
  });
});
