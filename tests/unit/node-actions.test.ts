import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, type FlowDoc } from '../../src/shared/graph';
import { extractSelection, type CopiedSelection } from '../../src/shared/subflow';
import {
  applyCommittedNodeLabel,
  buildInsertNodeFromSelectionResult,
  buildPasteDetachedSelectionResult,
  getNodeEditingDraft
} from '../../src/renderer/src/node-actions';

function createDoc(): FlowDoc {
  let doc = createEmptyDoc();
  doc = addNode(doc, 'Root');
  doc = addNode(doc, 'Child');
  doc = addNode(doc, 'Sibling');
  doc = addEdge(doc, 'n1', 'n2');
  doc = addEdge(doc, 'n1', 'n3');
  return doc;
}

describe('node action helpers', () => {
  it('creates editing drafts with clamped labels and ignores missing nodes', () => {
    const longLabel = 'x'.repeat(300);
    const doc = addNode(createEmptyDoc(), longLabel);

    expect(getNodeEditingDraft(doc, 'n1')).toEqual({
      nodeId: 'n1',
      label: 'x'.repeat(80)
    });
    expect(getNodeEditingDraft(doc, 'missing')).toBeNull();
  });

  it('commits trimmed labels and preserves the document when unchanged', () => {
    const doc = addNode(createEmptyDoc(), 'Original');

    expect(applyCommittedNodeLabel(doc, 'n1', 'Original')).toBe(doc);
    expect(applyCommittedNodeLabel(doc, 'n1', ' Updated ').nodes[0].label).toBe('Updated');
  });

  it('builds paste results with copied nodes selected and offset together', () => {
    const doc = createDoc();
    const copied = extractSelection(doc, ['n2', 'n3']);

    const result = buildPasteDetachedSelectionResult(doc, copied);

    expect(result?.newNodeIds).toEqual(['n4', 'n5']);
    expect(result?.offsetUpdates).toEqual({
      n4: { dx: 40, dy: 40 },
      n5: { dx: 40, dy: 40 }
    });
    expect(result?.doc.nodes.map(node => node.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
  });

  it('returns no paste result for an empty copied selection', () => {
    const emptySelection: CopiedSelection = { nodes: [], edges: [] };

    expect(buildPasteDetachedSelectionResult(createDoc(), emptySelection)).toBeNull();
  });

  it('builds child insert results from the selected node and inherits its offset', () => {
    const doc = createDoc();

    const result = buildInsertNodeFromSelectionResult(
      doc,
      ['n2'],
      { n2: { dx: 12, dy: 18 } },
      'child'
    );

    expect(result).toMatchObject({
      newNodeId: 'n4',
      newLabel: '',
      offset: { dx: 12, dy: 18 }
    });
    expect(result?.doc.edges).toContainEqual(expect.objectContaining({ from: 'n2', to: 'n4' }));
  });

  it('builds sibling insert results from the selected node parent and falls back to child insert for roots', () => {
    const doc = createDoc();

    const sibling = buildInsertNodeFromSelectionResult(
      doc,
      ['n2'],
      { n1: { dx: 7, dy: 9 }, n2: { dx: 20, dy: 30 } },
      'sibling'
    );
    expect(sibling).toMatchObject({
      newNodeId: 'n4',
      offset: { dx: 7, dy: 9 }
    });
    expect(sibling?.doc.edges).toContainEqual(expect.objectContaining({ from: 'n1', to: 'n4' }));

    const rootFallback = buildInsertNodeFromSelectionResult(
      doc,
      ['n1'],
      { n1: { dx: 3, dy: 4 } },
      'sibling'
    );
    expect(rootFallback).toMatchObject({
      newNodeId: 'n4',
      offset: { dx: 3, dy: 4 }
    });
    expect(rootFallback?.doc.edges).toContainEqual(expect.objectContaining({ from: 'n1', to: 'n4' }));
  });

  it('does not build insert results for multi-selection', () => {
    expect(buildInsertNodeFromSelectionResult(createDoc(), ['n1', 'n2'], {}, 'child')).toBeNull();
  });
});
