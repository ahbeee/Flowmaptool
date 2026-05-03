import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc } from '../../src/shared/graph';
import {
  buildCloseTabUpdate,
  buildNewTabUpdate,
  createSeedDoc,
  createTabDocument,
  ensureDocHasNode,
  getTabResetNodeId,
  NEW_NODE_LABEL,
  pruneTabTransientUiState,
  replaceTabWithNewDocument,
  ROOT_LABEL
} from '../../src/renderer/src/document-state';
import { ROOT_NODE_STYLE } from '../../src/renderer/src/node-style';

describe('document state helpers', () => {
  it('creates a seed document with a styled empty root node', () => {
    const doc = createSeedDoc();

    expect(doc.nodes).toEqual([{ id: 'n1', label: ROOT_LABEL, style: ROOT_NODE_STYLE }]);
    expect(doc.meta.nextNodeSeq).toBe(2);
  });

  it('ensures empty documents have a root node and preserves populated documents', () => {
    const ensured = ensureDocHasNode(createEmptyDoc());

    expect(ensured.nodes).toEqual([{ id: 'n1', label: ROOT_LABEL, style: ROOT_NODE_STYLE }]);

    const existing = addNode(createEmptyDoc(), 'Existing');
    expect(ensureDocHasNode(existing)).toBe(existing);
  });

  it('creates tab state around the provided document', () => {
    const doc = addNode(createEmptyDoc(), 'A');
    const tab = createTabDocument('tab-2', 'Imported', doc);

    expect(tab).toMatchObject({
      id: 'tab-2',
      title: 'Imported',
      currentFilePath: null,
      isDirty: false,
      layoutDirection: 'horizontal',
      nodeOffsetsByDirection: { horizontal: {}, vertical: {} },
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} },
      toolbarVisible: true,
      taskTable: {
        filters: {},
        visibleColumnKeys: ['task', 'category', 'priority', 'progress', 'assignee', 'start', 'due', 'tag', 'notes'],
        expanded: false,
        density: 'comfortable'
      },
      interactionHistory: { past: [], future: [] }
    });
    expect(tab.history).toEqual({ past: [], present: doc, future: [] });
  });

  it('uses empty labels for root and new child nodes', () => {
    expect(ROOT_LABEL).toBe('');
    expect(NEW_NODE_LABEL).toBe('');
  });

  it('builds new tab updates with the next untitled tab active', () => {
    const tabs = [createTabDocument('tab-1', 'Untitled 1')];

    expect(buildNewTabUpdate(tabs, 2)).toMatchObject({
      activeTabId: 'tab-2',
      tabCounter: 3,
      resetNodeId: 'n1',
      tabs: [{ id: 'tab-1' }, { id: 'tab-2', title: 'Untitled 2' }]
    });
  });

  it('builds close tab updates with a stable active tab fallback', () => {
    const tabs = [
      createTabDocument('tab-1', 'One'),
      createTabDocument('tab-2', 'Two'),
      createTabDocument('tab-3', 'Three')
    ];

    expect(buildCloseTabUpdate([tabs[0]], 'tab-1', 'tab-1')).toBeNull();
    expect(buildCloseTabUpdate(tabs, 'tab-3', 'missing')).toBeNull();
    expect(buildCloseTabUpdate(tabs, 'tab-3', 'tab-2')).toMatchObject({
      activeTabId: 'tab-3',
      tabs: [{ id: 'tab-1' }, { id: 'tab-3' }]
    });
    expect(buildCloseTabUpdate(tabs, 'tab-2', 'tab-2')).toMatchObject({
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1' }, { id: 'tab-3' }]
    });
  });

  it('gets reset node ids and replaces active tabs with new clean documents', () => {
    const doc = addNode(createEmptyDoc(), 'Existing');
    const tab = {
      ...createTabDocument('tab-5', 'Imported', doc),
      currentFilePath: 'C:/tmp/file.qflow',
      isDirty: true,
      toolbarVisible: false
    };

    expect(getTabResetNodeId(tab)).toBe('n1');
    expect(getTabResetNodeId(undefined)).toBeUndefined();

    const result = replaceTabWithNewDocument(tab, 6);
    expect(result.resetNodeId).toBe('n1');
    expect(result.tab).toMatchObject({
      id: 'tab-5',
      title: 'Untitled 6',
      currentFilePath: null,
      isDirty: false,
      toolbarVisible: true,
      taskTable: {
        filters: {},
        visibleColumnKeys: ['task', 'category', 'priority', 'progress', 'assignee', 'start', 'due', 'tag', 'notes'],
        expanded: false,
        density: 'comfortable'
      },
      nodeOffsetsByDirection: { horizontal: {}, vertical: {} },
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} },
      interactionHistory: { past: [], future: [] }
    });
  });

  it('prunes transient tab UI state that references missing nodes and edges', () => {
    let doc = addNode(createEmptyDoc(), 'A');
    doc = addNode(doc, 'B');
    doc = addEdge(doc, 'n1', 'n2');
    const tab = {
      ...createTabDocument('tab-3', 'Working', doc),
      nodeOffsetsByDirection: {
        horizontal: { n1: { dx: 10, dy: 20 }, missing: { dx: 30, dy: 40 } },
        vertical: { missing: { dx: 1, dy: 2 } }
      },
      edgeBendsByDirection: {
        horizontal: { e1: { x: 10, y: 20 }, missing: { x: 30, y: 40 } },
        vertical: { missing: { x: 50, y: 60 } }
      },
      edgeRoutesByDirection: {
        horizontal: {
          e1: { points: [{ x: 1, y: 2 }] },
          empty: { points: [] },
          missing: { points: [{ x: 3, y: 4 }] }
        },
        vertical: { missing: { points: [{ x: 5, y: 6 }] } }
      }
    };

    const pruned = pruneTabTransientUiState(tab);

    expect(pruned.nodeOffsetsByDirection).toEqual({
      horizontal: { n1: { dx: 10, dy: 20 } },
      vertical: {}
    });
    expect(pruned.edgeBendsByDirection).toEqual({
      horizontal: { e1: { x: 10, y: 20 } },
      vertical: {}
    });
    expect(pruned.edgeRoutesByDirection).toEqual({
      horizontal: { e1: { points: [{ x: 1, y: 2 }] } },
      vertical: {}
    });
  });

  it('keeps the tab reference when transient UI state is already valid', () => {
    let doc = addNode(createEmptyDoc(), 'A');
    doc = addNode(doc, 'B');
    doc = addEdge(doc, 'n1', 'n2');
    const tab = {
      ...createTabDocument('tab-4', 'Clean', doc),
      nodeOffsetsByDirection: {
        horizontal: { n1: { dx: 10, dy: 20 } },
        vertical: {}
      },
      edgeBendsByDirection: {
        horizontal: { e1: { x: 10, y: 20 } },
        vertical: {}
      },
      edgeRoutesByDirection: {
        horizontal: { e1: { points: [{ x: 1, y: 2 }] } },
        vertical: {}
      }
    };

    expect(pruneTabTransientUiState(tab)).toBe(tab);
  });
});
