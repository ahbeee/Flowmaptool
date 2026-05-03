import { describe, expect, it } from 'vitest';
import { addNode, createEmptyDoc } from '../../src/shared/graph';
import {
  createSeedDoc,
  createTabDocument,
  ensureDocHasNode,
  NEW_NODE_LABEL,
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
      interactionHistory: { past: [], future: [] }
    });
    expect(tab.history).toEqual({ past: [], present: doc, future: [] });
  });

  it('uses empty labels for root and new child nodes', () => {
    expect(ROOT_LABEL).toBe('');
    expect(NEW_NODE_LABEL).toBe('');
  });
});
