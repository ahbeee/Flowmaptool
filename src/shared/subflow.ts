import type { FlowDoc, FlowEdge, FlowNode, NodeId } from './graph';

export type CopiedSubflow = {
  rootId: NodeId;
  nodes: FlowNode[];
  edges: FlowEdge[];
};
export type CopiedSelection = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};
export type PasteDetachedResult = {
  doc: FlowDoc;
  newNodeIds: NodeId[];
};

function assertNodeExists(doc: FlowDoc, nodeId: NodeId) {
  if (!doc.nodes.some(node => node.id === nodeId)) {
    throw new Error(`unknown node id: ${nodeId}`);
  }
}

export function extractSubflow(doc: FlowDoc, rootId: NodeId): CopiedSubflow {
  assertNodeExists(doc, rootId);

  const visited = new Set<NodeId>();
  const queue: NodeId[] = [rootId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of doc.edges) {
      if (edge.from === current && !visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  const nodes = doc.nodes.filter(node => visited.has(node.id));
  const edges = doc.edges.filter(edge => visited.has(edge.from) && visited.has(edge.to));

  return {
    rootId,
    nodes,
    edges
  };
}

type PasteOptions = {
  spliceOutgoing?: boolean;
};

function findSinks(nodes: FlowNode[], edges: FlowEdge[]): NodeId[] {
  const nodeIds = new Set(nodes.map(node => node.id));
  const hasOutgoing = new Set<NodeId>();
  for (const edge of edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      hasOutgoing.add(edge.from);
    }
  }
  return nodes.map(node => node.id).filter(id => !hasOutgoing.has(id));
}

function addUniqueEdge(edges: FlowEdge[], edge: FlowEdge) {
  const exists = edges.some(current => current.from === edge.from && current.to === edge.to);
  if (!exists) edges.push(edge);
}

export function pasteSubflowAfter(
  doc: FlowDoc,
  copied: CopiedSubflow,
  targetNodeId: NodeId,
  options: PasteOptions = {}
): FlowDoc {
  assertNodeExists(doc, targetNodeId);
  if (copied.nodes.length === 0) return doc;

  const nodeIdMap = new Map<NodeId, NodeId>();
  let nextNodeSeq = doc.meta.nextNodeSeq;
  let nextEdgeSeq = doc.meta.nextEdgeSeq;

  const newNodes: FlowNode[] = [];
  for (const node of copied.nodes) {
    const newId = `n${nextNodeSeq++}`;
    nodeIdMap.set(node.id, newId);
    newNodes.push({
      id: newId,
      label: node.label,
      ...(node.style ? { style: { ...node.style } } : {})
    });
  }

  const outgoingTargets = doc.edges
    .filter(edge => edge.from === targetNodeId)
    .map(edge => edge.to);

  const keptEdges = options.spliceOutgoing
    ? doc.edges.filter(edge => edge.from !== targetNodeId)
    : [...doc.edges];

  const newEdges: FlowEdge[] = [...keptEdges];

  for (const edge of copied.edges) {
    const from = nodeIdMap.get(edge.from);
    const to = nodeIdMap.get(edge.to);
    if (!from || !to) continue;
    addUniqueEdge(newEdges, { id: `e${nextEdgeSeq++}`, from, to });
  }

  const pastedRootId = nodeIdMap.get(copied.rootId);
  if (!pastedRootId) {
    throw new Error('invalid copied subflow root');
  }
  addUniqueEdge(newEdges, { id: `e${nextEdgeSeq++}`, from: targetNodeId, to: pastedRootId });

  if (options.spliceOutgoing && outgoingTargets.length > 0) {
    const sinks = findSinks(copied.nodes, copied.edges)
      .map(sourceId => nodeIdMap.get(sourceId))
      .filter((id): id is string => Boolean(id));

    for (const sinkId of sinks) {
      for (const targetId of outgoingTargets) {
        addUniqueEdge(newEdges, { id: `e${nextEdgeSeq++}`, from: sinkId, to: targetId });
      }
    }
  }

  return {
    ...doc,
    nodes: [...doc.nodes, ...newNodes],
    edges: newEdges,
    meta: {
      ...doc.meta,
      nextNodeSeq,
      nextEdgeSeq
    }
  };
}

export function extractSelection(doc: FlowDoc, nodeIds: NodeId[]): CopiedSelection {
  const selected = new Set(nodeIds);
  if (selected.size === 0) {
    return { nodes: [], edges: [] };
  }
  const nodes = doc.nodes.filter(node => selected.has(node.id));
  const existingIds = new Set(nodes.map(node => node.id));
  const edges = doc.edges.filter(edge => existingIds.has(edge.from) && existingIds.has(edge.to));
  return { nodes, edges };
}

export function pasteDetached(doc: FlowDoc, copied: CopiedSelection): PasteDetachedResult {
  if (copied.nodes.length === 0) {
    return { doc, newNodeIds: [] };
  }
  const idMap = new Map<NodeId, NodeId>();
  let nextNodeSeq = doc.meta.nextNodeSeq;
  let nextEdgeSeq = doc.meta.nextEdgeSeq;

  const newNodes: FlowNode[] = [];
  for (const node of copied.nodes) {
    const newId = `n${nextNodeSeq++}`;
    idMap.set(node.id, newId);
    newNodes.push({
      id: newId,
      label: node.label,
      ...(node.style ? { style: { ...node.style } } : {})
    });
  }

  const newEdges: FlowEdge[] = [...doc.edges];
  for (const edge of copied.edges) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to) continue;
    newEdges.push({ id: `e${nextEdgeSeq++}`, from, to });
  }

  return {
    doc: {
      ...doc,
      nodes: [...doc.nodes, ...newNodes],
      edges: newEdges,
      meta: {
        ...doc.meta,
        nextNodeSeq,
        nextEdgeSeq
      }
    },
    newNodeIds: newNodes.map(node => node.id)
  };
}
