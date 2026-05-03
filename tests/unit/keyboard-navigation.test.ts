import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, type FlowDoc } from '../../src/shared/graph';
import type { NodeSizeMap } from '../../src/shared/layout';
import {
  getNodeSelectionByDirection,
  reorderSelectedNodeSibling
} from '../../src/renderer/src/keyboard-navigation';

const defaultSize = { width: 70, height: 28 };
const nodeSizeMap: NodeSizeMap = {
  n1: { width: 100, height: 40 }
};

function createDoc(): FlowDoc {
  let doc = createEmptyDoc();
  doc = addNode(doc, 'Root');
  doc = addNode(doc, 'A');
  doc = addNode(doc, 'B');
  doc = addNode(doc, 'C');
  doc = addEdge(doc, 'n1', 'n2');
  doc = addEdge(doc, 'n1', 'n3');
  doc = addEdge(doc, 'n1', 'n4');
  return doc;
}

describe('keyboard navigation helpers', () => {
  it('selects the nearest node in the requested direction with secondary-axis priority', () => {
    const nodes = [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }, { id: 'n4' }];
    const positions = new Map([
      ['n1', { id: 'n1', x: 0, y: 0 }],
      ['n2', { id: 'n2', x: 120, y: 0 }],
      ['n3', { id: 'n3', x: 90, y: 80 }],
      ['n4', { id: 'n4', x: -100, y: 10 }]
    ]);

    expect(getNodeSelectionByDirection(nodes, 'n1', 'arrowright', positions, nodeSizeMap, defaultSize)).toBe('n2');
    expect(getNodeSelectionByDirection(nodes, 'n1', 'arrowdown', positions, nodeSizeMap, defaultSize)).toBe('n3');
    expect(getNodeSelectionByDirection(nodes, 'n1', 'arrowleft', positions, nodeSizeMap, defaultSize)).toBe('n4');
    expect(getNodeSelectionByDirection(nodes, 'n1', 'escape', positions, nodeSizeMap, defaultSize)).toBeNull();
  });

  it('returns null when the selected node is missing or no candidate is in direction', () => {
    const nodes = [{ id: 'n1' }, { id: 'n2' }];
    const positions = new Map([
      ['n1', { id: 'n1', x: 0, y: 0 }],
      ['n2', { id: 'n2', x: 120, y: 0 }]
    ]);

    expect(getNodeSelectionByDirection(nodes, 'missing', 'arrowright', positions, {}, defaultSize)).toBeNull();
    expect(getNodeSelectionByDirection(nodes, 'n1', 'arrowup', positions, {}, defaultSize)).toBeNull();
  });

  it('reorders selected node among ordered layout siblings', () => {
    const doc = createDoc();
    const moved = reorderSelectedNodeSibling(doc, 'n3', -1);

    expect(moved).not.toBe(doc);
    expect(moved.edges.map(edge => [edge.id, edge.order])).toEqual([
      ['e1', 2],
      ['e2', 1],
      ['e3', 3]
    ]);
    expect(reorderSelectedNodeSibling(moved, 'n3', -1)).toBe(moved);
  });

  it('does not reorder roots or manual non-layout siblings', () => {
    const doc = {
      ...createDoc(),
      edges: createDoc().edges.map(edge => (edge.id === 'e2' ? { ...edge, role: 'manual' as const } : edge))
    };

    expect(reorderSelectedNodeSibling(doc, 'n1', 1)).toBe(doc);
    expect(reorderSelectedNodeSibling(doc, 'n3', 1)).toBe(doc);
  });
});
