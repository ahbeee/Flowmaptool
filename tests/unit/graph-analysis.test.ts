import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, type FlowDoc } from '../../src/shared/graph';
import {
  analyzeLayoutEdges,
  collectConnectedComponent,
  collectEdgeComponent,
  getOrderedLayoutChildEdges,
  getPrimaryParentEdge,
  getPrimaryParentId
} from '../../src/renderer/src/graph-analysis';

function createGraphDoc(): FlowDoc {
  let doc = createEmptyDoc();
  doc = addNode(doc, 'A');
  doc = addNode(doc, 'B');
  doc = addNode(doc, 'C');
  doc = addNode(doc, 'D');
  doc = addEdge(doc, 'n1', 'n2');
  doc = addEdge(doc, 'n2', 'n3');
  doc = addEdge(doc, 'n3', 'n1');
  doc = addEdge(doc, 'n4', 'n2');
  doc = addEdge(doc, 'n1', 'n4', 'manual');
  return doc;
}

describe('graph analysis helpers', () => {
  it('chooses layout edges across roots without treating manual edges as layout', () => {
    const analysis = analyzeLayoutEdges(createGraphDoc());

    expect([...analysis.layoutEdgeIds].sort()).toEqual(['e1', 'e2', 'e4']);
    expect(analysis.layoutEdges.map(edge => edge.id)).toEqual(['e1', 'e2', 'e4']);
    expect([...analysis.rootNodeIds].sort()).toEqual(['n1', 'n4']);
  });

  it('collects all connected nodes or only nodes connected by selected edge ids', () => {
    const doc = createGraphDoc();

    expect(collectConnectedComponent(doc, 'n4').sort()).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(collectEdgeComponent(doc, 'n4', new Set(['e1', 'e2']))).toEqual(['n4']);
    expect(collectEdgeComponent(doc, 'n1', new Set(['e1', 'e2'])).sort()).toEqual(['n1', 'n2', 'n3']);
  });

  it('uses edge order to resolve primary parents and ordered children', () => {
    const doc = {
      ...createGraphDoc(),
      edges: createGraphDoc().edges.map(edge => (edge.id === 'e4' ? { ...edge, order: 0 } : edge))
    };

    expect(getPrimaryParentId(doc, 'n2')).toBe('n4');
    expect(getPrimaryParentEdge(doc, 'n2')?.id).toBe('e4');
    expect(getOrderedLayoutChildEdges(doc, 'n1').map(edge => edge.id)).toEqual([]);
    expect(getOrderedLayoutChildEdges(doc, 'n4').map(edge => edge.id)).toEqual(['e4']);
  });
});
