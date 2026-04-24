import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addNode,
  createEmptyDoc,
  deserialize,
  migrateToLatest,
  serialize
} from '../../src/shared/graph';

describe('serialization and migration', () => {
  it('round-trips converge and loop edges', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addNode(doc, 'C');
    doc = addEdge(doc, 'n1', 'n2');
    doc = addEdge(doc, 'n3', 'n2');
    doc = addEdge(doc, 'n2', 'n1');

    const raw = serialize(doc);
    const parsed = deserialize(raw);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges.map(e => [e.from, e.to])).toEqual([
      ['n1', 'n2'],
      ['n3', 'n2'],
      ['n2', 'n1']
    ]);
  });

  it('migrates legacy file without schemaVersion', () => {
    const legacy = {
      nodes: [{ label: 'A' }, { id: 'n8', label: 'B' }],
      edges: [{ from: 'n1', to: 'n8' }, { from: 'missing', to: 'n8' }]
    };
    const doc = migrateToLatest(legacy);

    expect(doc.schemaVersion).toBe(1);
    expect(doc.nodes.map(n => n.id)).toEqual(['n1', 'n8']);
    expect(doc.edges.map(e => [e.from, e.to])).toEqual([['n1', 'n8']]);
    expect(doc.meta.nextNodeSeq).toBe(9);
    expect(doc.meta.nextEdgeSeq).toBe(2);
  });
});
