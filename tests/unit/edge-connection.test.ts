import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, type FlowDoc } from '../../src/shared/graph';
import { planEdgeConnection } from '../../src/renderer/src/edge-connection';

function createDoc(nodeCount = 3): FlowDoc {
  let doc = createEmptyDoc();
  for (let index = 1; index <= nodeCount; index += 1) {
    doc = addNode(doc, `Node ${index}`);
  }
  return doc;
}

describe('edge connection planning', () => {
  it('blocks invalid same-side handles before normalization', () => {
    const plan = planEdgeConnection(createDoc(2), 'n1', 'n2', 'n1', new Set(['n1']), {
      from: 'front',
      to: 'front'
    });

    expect(plan).toEqual({ ok: false, message: 'Connect blocked: use opposite node handles' });
  });

  it('normalizes disconnected edges into the primary root direction', () => {
    const plan = planEdgeConnection(createDoc(2), 'n2', 'n1', 'n1', new Set(['n1', 'n2']));

    expect(plan).toMatchObject({
      ok: true,
      from: 'n1',
      to: 'n2',
      role: 'layout',
      mergedComponentNodeIds: ['n1', 'n2'],
      shouldNormalizeAttachedRoot: true
    });
  });

  it('reverses explicit opposite root-handle connections with anchors', () => {
    const plan = planEdgeConnection(createDoc(2), 'n1', 'n2', 'n1', new Set(['n1', 'n2']), {
      from: 'front',
      to: 'back'
    });

    expect(plan).toMatchObject({
      ok: true,
      from: 'n2',
      to: 'n1',
      role: 'layout',
      anchors: { from: 'back', to: 'front' }
    });
  });

  it('uses manual role inside an existing component', () => {
    const doc = addEdge(createDoc(2), 'n1', 'n2');
    const plan = planEdgeConnection(doc, 'n2', 'n1', 'n1', new Set(['n1']));

    expect(plan).toMatchObject({
      ok: true,
      from: 'n2',
      to: 'n1',
      role: 'manual',
      mergedComponentNodeIds: null
    });
  });

  it('marks secondary roots for style normalization when attaching them', () => {
    const doc = addEdge(createDoc(3), 'n1', 'n2');
    const plan = planEdgeConnection(doc, 'n2', 'n3', 'n1', new Set(['n1', 'n3']));

    expect(plan).toMatchObject({
      ok: true,
      from: 'n2',
      to: 'n3',
      role: 'layout',
      shouldNormalizeAttachedRoot: true
    });
  });

  it('returns user-facing validation messages for self and duplicate manual edges', () => {
    let doc = addEdge(createDoc(2), 'n1', 'n2');
    doc = addEdge(doc, 'n2', 'n1', 'manual');

    expect(planEdgeConnection(doc, 'n1', 'n1', 'n1', new Set(['n1']))).toEqual({
      ok: false,
      message: 'Connect blocked: source and target are the same node'
    });
    expect(planEdgeConnection(doc, 'n2', 'n1', 'n1', new Set(['n1']))).toEqual({
      ok: false,
      message: 'Connect blocked: edge already exists'
    });
  });
});
