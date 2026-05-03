import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc } from '../../src/shared/graph';
import {
  emptyEdgeBendsByDirection,
  emptyEdgeRoutesByDirection,
  emptyOffsetsByDirection,
  parsePersistedQflow,
  serializePersistedQflow
} from '../../src/renderer/src/persistence';

const parseOptions = {
  emptyRootLabel: '',
  emptyRootStyle: { shape: 'rounded' as const }
};

describe('qflow persistence helpers', () => {
  it('parses legacy raw FlowDoc files and ensures an empty document has a root node', () => {
    const parsed = parsePersistedQflow(JSON.stringify({ schemaVersion: 1, nodes: [], edges: [] }), parseOptions);

    expect(parsed.doc.nodes).toHaveLength(1);
    expect(parsed.doc.nodes[0].style?.shape).toBe('rounded');
    expect(parsed.ui.layoutDirection).toBe('horizontal');
  });

  it('round-trips wrapper files with sanitized persisted UI state', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addEdge(doc, 'n1', 'n2');

    const raw = serializePersistedQflow({
      doc,
      layoutDirection: 'vertical',
      nodeOffsetsByDirection: {
        horizontal: { n1: { dx: 10, dy: 20 }, missing: { dx: 1, dy: 1 } },
        vertical: { n2: { dx: 0, dy: 0 } }
      },
      edgeBendsByDirection: {
        horizontal: { e1: { x: 100, y: 120 } },
        vertical: { missing: { x: 1, y: 2 } }
      },
      edgeRoutesByDirection: {
        horizontal: { e1: { points: [{ x: 4, y: 5 }] } },
        vertical: { e1: { points: [] } }
      },
      toolbarVisible: false
    });

    const parsed = parsePersistedQflow(raw, parseOptions);

    expect(parsed.ui.layoutDirection).toBe('vertical');
    expect(parsed.ui.nodeOffsetsByDirection.horizontal).toEqual({ n1: { dx: 10, dy: 20 } });
    expect(parsed.ui.nodeOffsetsByDirection.vertical).toEqual({});
    expect(parsed.ui.edgeBendsByDirection.horizontal).toEqual({ e1: { x: 100, y: 120 } });
    expect(parsed.ui.edgeBendsByDirection.vertical).toEqual({});
    expect(parsed.ui.edgeRoutesByDirection.horizontal).toEqual({ e1: { points: [{ x: 4, y: 5 }] } });
    expect(parsed.ui.edgeRoutesByDirection.vertical).toEqual({});
    expect(parsed.ui.toolbarVisible).toBe(false);
  });

  it('migrates legacy flat edge bends into the active layout direction', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addEdge(doc, 'n1', 'n2');

    const parsed = parsePersistedQflow(
      JSON.stringify({
        schemaVersion: 1,
        doc,
        ui: {
          layoutDirection: 'vertical',
          edgeBends: { e1: { x: 30, y: 40 } }
        }
      }),
      parseOptions
    );

    expect(parsed.ui.edgeBendsByDirection.vertical).toEqual({ e1: { x: 30, y: 40 } });
    expect(parsed.ui.edgeBendsByDirection.horizontal).toEqual({});
  });

  it('throws user-readable errors for invalid files', () => {
    expect(() => parsePersistedQflow('{ bad json', parseOptions)).toThrow('not valid JSON');
    expect(() => parsePersistedQflow(JSON.stringify({ name: 'not a graph' }), parseOptions)).toThrow(
      'not a Flowmaptool document'
    );
    expect(() =>
      parsePersistedQflow(JSON.stringify({ schemaVersion: 999, nodes: [], edges: [] }), parseOptions)
    ).toThrow('newer Flowmaptool version');
  });

  it('provides empty UI state factories', () => {
    expect(emptyOffsetsByDirection()).toEqual({ horizontal: {}, vertical: {} });
    expect(emptyEdgeBendsByDirection()).toEqual({ horizontal: {}, vertical: {} });
    expect(emptyEdgeRoutesByDirection()).toEqual({ horizontal: {}, vertical: {} });
  });
});
