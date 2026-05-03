import type { FlowDoc, FlowEdge, NodeId } from '@shared/graph';

export type LayoutEdgeAnalysis = {
  layoutEdges: FlowEdge[];
  layoutEdgeIds: Set<string>;
  rootNodeIds: Set<NodeId>;
};

function edgeSeq(edgeId: string): number {
  if (!edgeId.startsWith('e')) return Number.MAX_SAFE_INTEGER;
  const value = Number(edgeId.slice(1));
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function edgeOrder(edge: FlowEdge): number {
  return typeof edge.order === 'number' && Number.isFinite(edge.order) ? edge.order : edgeSeq(edge.id);
}

export function compareEdgeOrder(a: FlowEdge, b: FlowEdge): number {
  return edgeOrder(a) - edgeOrder(b) || edgeSeq(a.id) - edgeSeq(b.id) || a.id.localeCompare(b.id);
}

export function isLayoutEdge(edge: FlowEdge): boolean {
  return edge.role !== 'manual';
}

export function analyzeLayoutEdges(doc: FlowDoc): LayoutEdgeAnalysis {
  const nodeIds = new Set(doc.nodes.map(node => node.id));
  const incomingCount = new Map<NodeId, number>();
  const outgoing = new Map<NodeId, FlowEdge[]>();
  for (const node of doc.nodes) {
    incomingCount.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of doc.edges) {
    if (!isLayoutEdge(edge)) continue;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge);
  }
  for (const edges of outgoing.values()) {
    edges.sort(compareEdgeOrder);
  }

  const rootIds = doc.nodes.map(node => node.id).filter(id => (incomingCount.get(id) || 0) === 0);
  const traversalRoots = [...rootIds];
  const firstNodeId = doc.nodes[0]?.id;
  if (firstNodeId && !traversalRoots.includes(firstNodeId)) traversalRoots.unshift(firstNodeId);

  const depthByNode = new Map<NodeId, number>();
  const queue: NodeId[] = [];
  for (const rootId of traversalRoots) {
    if (depthByNode.has(rootId)) continue;
    depthByNode.set(rootId, 0);
    queue.push(rootId);
  }

  const layoutEdgeIds = new Set<string>();
  while (queue.length > 0) {
    const from = queue.shift()!;
    const fromDepth = depthByNode.get(from) || 0;
    for (const edge of outgoing.get(from) || []) {
      const existingToDepth = depthByNode.get(edge.to);
      if (typeof existingToDepth !== 'number') {
        depthByNode.set(edge.to, fromDepth + 1);
        layoutEdgeIds.add(edge.id);
        queue.push(edge.to);
        continue;
      }
      if (fromDepth < existingToDepth) {
        layoutEdgeIds.add(edge.id);
      }
    }
  }

  const layoutEdges = doc.edges.filter(edge => layoutEdgeIds.has(edge.id));
  const layoutIncoming = new Map<NodeId, number>();
  for (const node of doc.nodes) layoutIncoming.set(node.id, 0);
  for (const edge of layoutEdges) {
    layoutIncoming.set(edge.to, (layoutIncoming.get(edge.to) || 0) + 1);
  }

  return {
    layoutEdges,
    layoutEdgeIds,
    rootNodeIds: new Set(doc.nodes.map(node => node.id).filter(id => (layoutIncoming.get(id) || 0) === 0))
  };
}

export function collectConnectedComponent(doc: FlowDoc, startNodeId: NodeId): NodeId[] {
  const neighbors = new Map<NodeId, Set<NodeId>>();
  for (const node of doc.nodes) {
    neighbors.set(node.id, new Set());
  }
  for (const edge of doc.edges) {
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  }
  const queue: NodeId[] = [startNodeId];
  const visited = new Set<NodeId>([startNodeId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbors.get(current) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return [...visited];
}

export function collectEdgeComponent(doc: FlowDoc, startNodeId: NodeId, edgeIds: Set<string>): NodeId[] {
  const neighbors = new Map<NodeId, Set<NodeId>>();
  for (const node of doc.nodes) {
    neighbors.set(node.id, new Set());
  }
  for (const edge of doc.edges) {
    if (!edgeIds.has(edge.id)) continue;
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  }
  const queue: NodeId[] = [startNodeId];
  const visited = new Set<NodeId>([startNodeId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbors.get(current) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return [...visited];
}

export function getPrimaryParentId(doc: FlowDoc, nodeId: NodeId): NodeId | null {
  return getPrimaryParentEdge(doc, nodeId)?.from || null;
}

export function getPrimaryParentEdge(doc: FlowDoc, nodeId: NodeId): FlowEdge | null {
  const incoming = doc.edges.filter(edge => edge.to === nodeId && isLayoutEdge(edge)).sort(compareEdgeOrder);
  return incoming[0] || null;
}

export function getOrderedLayoutChildEdges(doc: FlowDoc, parentId: NodeId): FlowEdge[] {
  const primaryByChild = new Map<NodeId, FlowEdge>();
  for (const edge of doc.edges.filter(edge => edge.from === parentId && isLayoutEdge(edge)).sort(compareEdgeOrder)) {
    const primaryEdge = getPrimaryParentEdge(doc, edge.to);
    if (primaryEdge?.id === edge.id) primaryByChild.set(edge.to, edge);
  }
  return [...primaryByChild.values()].sort(compareEdgeOrder);
}
