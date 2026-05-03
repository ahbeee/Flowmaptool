import { describe, expect, it } from 'vitest';
import type { FlowDoc } from '../../src/shared/graph';
import { buildOutlineChecklistTargetsByNodeId, buildOutlineTree } from '../../src/renderer/src/outline';

function fixtureDoc(): FlowDoc {
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'n1', label: 'Root' },
      { id: 'n2', label: 'Second', style: { tagId: 'tag-task' } },
      { id: 'n3', label: 'First', style: { tagId: 'tag-task' } },
      { id: 'n4', label: 'Manual only', style: { tagId: 'tag-task' } },
      { id: 'n5', label: 'Cycle' }
    ],
    edges: [
      { id: 'e2', from: 'n1', to: 'n2', order: 2 },
      { id: 'e1', from: 'n1', to: 'n3', order: 1 },
      { id: 'e3', from: 'n3', to: 'n5' },
      { id: 'e4', from: 'n5', to: 'n1' },
      { id: 'e5', from: 'n1', to: 'n4', role: 'manual' }
    ],
    meta: { nextNodeSeq: 6, nextEdgeSeq: 6 },
    settings: {
      themeId: 'blue-gray',
      spacing: { horizontal: 48, vertical: 48 },
      defaultShape: 'plain',
      defaultEdgeStyle: {},
      tags: [{ id: 'tag-task', name: 'Task', color: '#ec4899' }]
    },
    checklist: { checkedNodeIds: [] }
  };
}

describe('outline helpers', () => {
  it('builds primary layout hierarchy and ignores manual-only edges', () => {
    const tree = buildOutlineTree(fixtureDoc());

    expect(tree.map(item => item.node.id)).toEqual(['n4', 'n1', 'n2', 'n3', 'n5']);
    expect(tree[0].children).toEqual([]);
    expect(tree[1].children.map(item => item.node.id)).toEqual(['n3', 'n2']);
  });

  it('keeps ordered children and breaks cycles into deterministic leftovers', () => {
    const doc = fixtureDoc();
    const tree = buildOutlineTree({
      ...doc,
      edges: doc.edges.filter(edge => edge.id !== 'e4')
    });

    expect(tree.map(item => item.node.id)).toEqual(['n1', 'n4']);
    expect(tree[0].children.map(item => item.node.id)).toEqual(['n3', 'n2']);
    expect(tree[0].children[0].children.map(item => item.node.id)).toEqual(['n5']);
  });

  it('derives checklist targets from tagged descendants', () => {
    const doc = fixtureDoc();
    const tree = buildOutlineTree({
      ...doc,
      edges: doc.edges.filter(edge => edge.id !== 'e4')
    });
    const targets = buildOutlineChecklistTargetsByNodeId(tree, new Set(['tag-task']));

    expect(targets.get('n1')).toEqual(['n3', 'n2']);
    expect(targets.get('n3')).toEqual(['n3']);
    expect(targets.get('n4')).toEqual(['n4']);
  });
});
