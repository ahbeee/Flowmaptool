import { describe, expect, it } from 'vitest';
import type { FlowDoc } from '../../src/shared/graph';
import {
  buildOutlineChecklistTargetsByNodeId,
  buildOutlineTree,
  collectAncestorOutlineNodeIdsForTargets,
  collectCollapsibleOutlineNodeIds,
  filterOutlineTree,
  filterOutlineTreeByChecklistView,
  filterOutlineTreeByChecklistTargets,
  getOutlineChecklistCounts,
  toggleCollapsedOutlineNodeIds
} from '../../src/renderer/src/outline';

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

  it('filters outline tree to checklist-capable branches', () => {
    const doc = fixtureDoc();
    const tree = buildOutlineTree({
      ...doc,
      edges: doc.edges.filter(edge => edge.id !== 'e4')
    });
    const targets = buildOutlineChecklistTargetsByNodeId(tree, new Set(['tag-task']));
    const checklistTree = filterOutlineTreeByChecklistTargets(tree, targets);

    expect(checklistTree.map(item => item.node.id)).toEqual(['n1', 'n4']);
    expect(checklistTree[0].children.map(item => item.node.id)).toEqual(['n3', 'n2']);
    expect(checklistTree[0].children[0].children).toEqual([]);
  });

  it('filters checklist branches by open and done state while preserving context', () => {
    const doc = fixtureDoc();
    const tree = buildOutlineTree({
      ...doc,
      edges: doc.edges.filter(edge => edge.id !== 'e4')
    });
    const targets = buildOutlineChecklistTargetsByNodeId(tree, new Set(['tag-task']));
    const checklistTree = filterOutlineTreeByChecklistTargets(tree, targets);
    const isChecked = (nodeId: string) => nodeId === 'n3';

    const openTree = filterOutlineTreeByChecklistView(checklistTree, targets, isChecked, 'open');
    expect(openTree.map(item => item.node.id)).toEqual(['n1', 'n4']);
    expect(openTree[0].children.map(item => item.node.id)).toEqual(['n2']);

    const doneTree = filterOutlineTreeByChecklistView(checklistTree, targets, isChecked, 'done');
    expect(doneTree.map(item => item.node.id)).toEqual(['n1']);
    expect(doneTree[0].children.map(item => item.node.id)).toEqual(['n3']);
  });

  it('counts unique checklist targets for checklist view tabs', () => {
    const doc = fixtureDoc();
    const tree = buildOutlineTree({
      ...doc,
      edges: doc.edges.filter(edge => edge.id !== 'e4')
    });
    const targets = buildOutlineChecklistTargetsByNodeId(tree, new Set(['tag-task']));
    const checklistTree = filterOutlineTreeByChecklistTargets(tree, targets);
    const isChecked = (nodeId: string) => nodeId === 'n3';

    expect(getOutlineChecklistCounts(checklistTree, targets, isChecked)).toEqual({
      all: 3,
      open: 2,
      done: 1
    });
  });

  it('filters outline nodes by label, tag, and task metadata while preserving context', () => {
    const doc = fixtureDoc();
    const tree = buildOutlineTree({
      ...doc,
      nodes: doc.nodes.map(node =>
        node.id === 'n5'
          ? {
              ...node,
              task: {
                enabled: true,
                done: false,
                status: 'waiting',
                priority: 'normal',
                progress: 0,
                note: 'Vendor response'
              }
            }
          : node
      ),
      edges: doc.edges.filter(edge => edge.id !== 'e4')
    });
    const tags = new Map(doc.settings.tags.map(tag => [tag.id, tag]));

    const byLabel = filterOutlineTree(tree, 'cycle', tags);
    expect(byLabel.tree.map(item => item.node.id)).toEqual(['n1']);
    expect(byLabel.tree[0].children.map(item => item.node.id)).toEqual(['n3']);
    expect(byLabel.tree[0].children[0].children.map(item => item.node.id)).toEqual(['n5']);
    expect([...byLabel.expandedNodeIds]).toEqual(['n3', 'n1']);
    expect([...byLabel.matchedNodeIds]).toEqual(['n5']);

    const byTag = filterOutlineTree(tree, 'task', tags);
    expect(byTag.matchedNodeIds).toEqual(new Set(['n3', 'n2', 'n4']));

    const byNote = filterOutlineTree(tree, 'vendor', tags);
    expect(byNote.matchedNodeIds).toEqual(new Set(['n5']));
  });

  it('toggles collapsed outline nodes without mutating the current set', () => {
    const current = new Set(['n1', 'n2']);
    const expanded = toggleCollapsedOutlineNodeIds(current, 'n1');
    const collapsed = toggleCollapsedOutlineNodeIds(current, 'n3');

    expect([...current]).toEqual(['n1', 'n2']);
    expect([...expanded]).toEqual(['n2']);
    expect([...collapsed]).toEqual(['n1', 'n2', 'n3']);
  });

  it('collects outline nodes that can be collapsed', () => {
    const doc = fixtureDoc();
    const tree = buildOutlineTree({
      ...doc,
      edges: doc.edges.filter(edge => edge.id !== 'e4')
    });

    expect(collectCollapsibleOutlineNodeIds(tree)).toEqual(['n1', 'n3']);
  });

  it('collects ancestors for selected outline targets', () => {
    const doc = fixtureDoc();
    const tree = buildOutlineTree({
      ...doc,
      edges: doc.edges.filter(edge => edge.id !== 'e4')
    });

    expect([...collectAncestorOutlineNodeIdsForTargets(tree, new Set(['n5']))]).toEqual(['n1', 'n3']);
    expect([...collectAncestorOutlineNodeIdsForTargets(tree, new Set(['n1']))]).toEqual([]);
  });
});
