import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, type FlowDoc } from '../../src/shared/graph';
import { extractSelection, extractSubflow, pasteDetached, pasteSubflowAfter } from '../../src/shared/subflow';

function buildDemoDoc(): FlowDoc {
  let doc = createEmptyDoc();
  doc = addNode(doc, '1');
  doc = addNode(doc, '2');
  doc = addNode(doc, '3');
  doc = addNode(doc, '4');
  doc = addEdge(doc, 'n1', 'n2');
  doc = addEdge(doc, 'n2', 'n3');
  doc = addEdge(doc, 'n3', 'n4');
  return doc;
}

describe('subflow', () => {
  it('extracts descendants from a root', () => {
    const doc = buildDemoDoc();
    const copied = extractSubflow(doc, 'n2');

    expect(copied.rootId).toBe('n2');
    expect(copied.nodes.map(n => n.id).sort()).toEqual(['n2', 'n3', 'n4']);
    expect(copied.edges.map(e => `${e.from}->${e.to}`).sort()).toEqual(['n2->n3', 'n3->n4']);
  });

  it('pastes copied subflow after target and reconnects outgoing edges', () => {
    const doc = buildDemoDoc();
    const copied = extractSubflow(doc, 'n2');
    const next = pasteSubflowAfter(doc, copied, 'n1', { spliceOutgoing: true });

    expect(next.nodes.length).toBe(7);
    expect(next.edges.some(e => e.from === 'n1' && e.to === 'n2')).toBe(false);

    const newRoot = next.edges.find(e => e.from === 'n1' && e.to.startsWith('n5'));
    expect(Boolean(newRoot)).toBe(true);

    const hasReconnect = next.edges.some(
      e => e.from !== 'n1' && e.to === 'n2' && e.from.startsWith('n')
    );
    expect(hasReconnect).toBe(true);
  });

  it('copies and pastes selected nodes with internal edges only', () => {
    const doc = buildDemoDoc();
    const copied = extractSelection(doc, ['n2', 'n3']);
    const next = pasteDetached(doc, copied);

    expect(next.doc.nodes.length).toBe(6);
    expect(next.doc.edges.length).toBe(4);
    expect(next.newNodeIds.length).toBe(2);
  });
});
