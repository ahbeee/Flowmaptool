import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addNode,
  createEmptyDoc,
  deserialize,
  migrateToLatest,
  setNodeChecked,
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

  it('round-trips manual edge roles', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = addEdge(doc, 'n1', 'n2', 'manual', { from: 'back', to: 'body' });

    const parsed = deserialize(serialize(doc));

    expect(parsed.edges[0]).toMatchObject({
      from: 'n1',
      to: 'n2',
      role: 'manual',
      anchors: {
        from: 'back',
        to: 'body'
      }
    });
  });

  it('drops invalid edge anchors during migration', () => {
    const legacy = {
      nodes: [{ id: 'n1', label: 'A' }, { id: 'n2', label: 'B' }],
      edges: [{ id: 'e1', from: 'n1', to: 'n2', anchors: { from: 'bad', to: 'front' } }]
    };
    const doc = migrateToLatest(legacy);

    expect(doc.edges[0].anchors).toEqual({ to: 'front' });
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

  it('round-trips checklist state and drops invalid checked nodes', () => {
    let doc = createEmptyDoc();
    doc = addNode(doc, 'A');
    doc = addNode(doc, 'B');
    doc = setNodeChecked(doc, 'n1', true);

    const parsed = deserialize(serialize(doc));
    expect(parsed.checklist.checkedNodeIds).toEqual(['n1']);

    const migrated = migrateToLatest({
      nodes: [{ id: 'n1', label: 'A' }],
      edges: [],
      checklist: { checkedNodeIds: ['n1', 'missing', 'n1'] }
    });
    expect(migrated.checklist.checkedNodeIds).toEqual(['n1']);
  });
});
