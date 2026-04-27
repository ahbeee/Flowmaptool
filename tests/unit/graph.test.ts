import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addNode,
  createEmptyDoc,
  deserialize,
  reparentNode,
  removeEdge,
  removeNode,
  removeNodes,
  updateNodeLabel,
  validateEdge
} from '../../src/shared/graph';

describe('graph model', () => {
  it('uses the requested document and node defaults', () => {
    let doc = createEmptyDoc();

    expect(doc.settings.spacing).toEqual({ horizontal: 48, vertical: 24 });
    expect(doc.settings.defaultShape).toBe('plain');

    doc = addNode(doc, '', {
      fontFamily: 'Roboto',
      fontSize: 12,
      shape: 'plain'
    });

    expect(doc.nodes[0]).toMatchObject({
      id: 'n1',
      label: '',
      style: {
        fontFamily: 'Roboto',
        fontSize: 12,
        shape: 'plain'
      }
    });
  });

  it('allows zero spacing when loading settings', () => {
    const doc = deserialize(
      JSON.stringify({
        schemaVersion: 1,
        nodes: [],
        edges: [],
        meta: { nextNodeSeq: 1, nextEdgeSeq: 1 },
        settings: {
          spacing: { horizontal: 0, vertical: 0 }
        }
      })
    );

    expect(doc.settings.spacing).toEqual({ horizontal: 0, vertical: 0 });
  });

  it('supports converge and loop edges', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addNode(doc, 'C');

    doc = addEdge(doc, 'n1', 'n2'); // A->B
    doc = addEdge(doc, 'n3', 'n2'); // C->B
    doc = addEdge(doc, 'n2', 'n1'); // B->A

    expect(doc.edges).toHaveLength(3);
    expect(doc.edges.map(e => [e.from, e.to])).toEqual([
      ['n1', 'n2'],
      ['n3', 'n2'],
      ['n2', 'n1']
    ]);
  });

  it('deletes edge by id only', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addNode(doc, 'C');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n1', 'n3');

    const edgeIdToDelete = doc.edges[0].id;
    doc = removeEdge(doc, edgeIdToDelete);

    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0].from).toBe('n1');
    expect(doc.edges[0].to).toBe('n3');
  });

  it('removes related edges when deleting node', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addNode(doc, 'C');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n3', 'n2');
    doc = addEdge(doc, 'n2', 'n1');

    doc = removeNode(doc, 'n2');

    expect(doc.nodes.map(n => n.id)).toEqual(['n1', 'n3']);
    expect(doc.edges).toHaveLength(0);
  });

  it('uses monotonically increasing ids after delete', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addEdge(doc, 'n1', 'n2');
    doc = removeNode(doc, 'n2');
    doc = addNode(doc, 'C');
    doc = addEdge(doc, 'n1', 'n3');

    expect(doc.nodes.map(node => node.id)).toEqual(['n1', 'n3']);
    expect(doc.edges.map(edge => edge.id)).toEqual(['e2']);
    expect(doc.meta.nextNodeSeq).toBe(4);
    expect(doc.meta.nextEdgeSeq).toBe(3);
  });

  it('updates node label by id', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'Before');
    doc = updateNodeLabel(doc, 'n1', 'After');
    expect(doc.nodes[0].label).toBe('After');
  });

  it('throws when creating an edge with unknown node', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');

    expect(() => addEdge(doc, 'n1', 'n999')).toThrow('unknown node id');
  });

  it('blocks self-edge and duplicate-edge in validation', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addEdge(doc, 'n1', 'n2');

    expect(validateEdge(doc, 'n1', 'n1')).toEqual({ ok: false, reason: 'self-edge' });
    expect(validateEdge(doc, 'n1', 'n2')).toEqual({ ok: false, reason: 'duplicate-edge' });
    expect(validateEdge(doc, 'n2', 'n1')).toEqual({ ok: true });
  });

  it('reparents by replacing the primary incoming edge', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addNode(doc, 'C');
    doc = addEdge(doc, 'n1', 'n3');
    doc = reparentNode(doc, 'n3', 'n2');

    expect(doc.edges.map(e => `${e.from}->${e.to}`)).toEqual(['n2->n3']);
  });

  it('batch deletes interwoven segment and clears all related edges', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, '1');
    doc = addNode(doc, '2');
    doc = addNode(doc, '3');
    doc = addNode(doc, '4');
    doc = addNode(doc, '5');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n2', 'n3');
    doc = addEdge(doc, 'n1', 'n4');
    doc = addEdge(doc, 'n4', 'n3');
    doc = addEdge(doc, 'n3', 'n5');

    doc = removeNodes(doc, ['n2', 'n4']);

    expect(doc.nodes.map(n => n.id)).toEqual(['n1', 'n3', 'n5']);
    expect(doc.edges.map(e => `${e.from}->${e.to}`)).toEqual(['n3->n5']);
  });
});
