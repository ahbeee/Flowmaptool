import type { FlowDoc, FlowEdge, FlowNode, NodeId } from '@shared/graph';

export type OutlineTreeNode = {
  node: FlowNode;
  children: OutlineTreeNode[];
};

function nodeSeq(nodeId: NodeId): number {
  const match = /^n(\d+)$/.exec(String(nodeId));
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function compareNodeIdOrder(a: NodeId, b: NodeId): number {
  return nodeSeq(a) - nodeSeq(b) || String(a).localeCompare(String(b));
}

function edgeSeq(edgeId: string): number {
  const match = /^e(\d+)$/.exec(String(edgeId));
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function edgeOrder(edge: FlowEdge): number {
  return typeof edge.order === 'number' && Number.isFinite(edge.order) ? edge.order : edgeSeq(edge.id);
}

function compareEdgeOrder(a: FlowEdge, b: FlowEdge): number {
  return edgeOrder(a) - edgeOrder(b) || edgeSeq(a.id) - edgeSeq(b.id) || a.id.localeCompare(b.id);
}

function isLayoutEdge(edge: FlowEdge): boolean {
  return edge.role !== 'manual';
}

function compareOutlineEdges(a: FlowEdge, b: FlowEdge): number {
  return compareEdgeOrder(a, b) || compareNodeIdOrder(a.to, b.to);
}

export function buildOutlineTree(doc: FlowDoc): OutlineTreeNode[] {
  const nodeById = new Map<NodeId, FlowNode>();
  for (const node of doc.nodes) {
    nodeById.set(node.id, node);
  }

  const primaryIncoming = new Map<NodeId, FlowEdge>();
  for (const edge of doc.edges) {
    if (!isLayoutEdge(edge) || edge.from === edge.to) continue;
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
    const current = primaryIncoming.get(edge.to);
    if (!current || compareOutlineEdges(edge, current) < 0) {
      primaryIncoming.set(edge.to, edge);
    }
  }

  const childEdgesByParent = new Map<NodeId, FlowEdge[]>();
  for (const edge of doc.edges) {
    if (!isLayoutEdge(edge)) continue;
    if (primaryIncoming.get(edge.to)?.id !== edge.id) continue;
    const list = childEdgesByParent.get(edge.from) || [];
    list.push(edge);
    childEdgesByParent.set(edge.from, list);
  }
  for (const list of childEdgesByParent.values()) {
    list.sort(compareOutlineEdges);
  }

  const visited = new Set<NodeId>();
  const buildNode = (node: FlowNode, stack: Set<NodeId>): OutlineTreeNode => {
    visited.add(node.id);
    if (stack.has(node.id)) return { node, children: [] };
    const nextStack = new Set(stack);
    nextStack.add(node.id);
    const children = (childEdgesByParent.get(node.id) || [])
      .map(edge => nodeById.get(edge.to))
      .filter((child): child is FlowNode => Boolean(child))
      .filter(child => !nextStack.has(child.id))
      .map(child => buildNode(child, nextStack));
    return { node, children };
  };

  const roots = doc.nodes.filter(node => !primaryIncoming.has(node.id)).sort((a, b) => compareNodeIdOrder(a.id, b.id));
  const tree = roots.map(root => buildNode(root, new Set<NodeId>()));
  const leftovers = doc.nodes
    .filter(node => !visited.has(node.id))
    .sort((a, b) => compareNodeIdOrder(a.id, b.id))
    .map(node => buildNode(node, new Set<NodeId>()));
  return [...tree, ...leftovers];
}

export function buildOutlineChecklistTargetsByNodeId(
  outlineTree: OutlineTreeNode[],
  validTagIds: Set<string>
): Map<NodeId, NodeId[]> {
  const targetsByNodeId = new Map<NodeId, NodeId[]>();
  const hasChecklistTarget = (node: FlowNode) => Boolean(node.style?.tagId && validTagIds.has(node.style.tagId));

  const visit = (item: OutlineTreeNode): NodeId[] => {
    const targets: NodeId[] = item.children.flatMap(visit);
    if (hasChecklistTarget(item.node)) {
      targets.unshift(item.node.id);
    }
    targetsByNodeId.set(item.node.id, targets);
    return targets;
  };

  outlineTree.forEach(visit);
  return targetsByNodeId;
}

export function toggleCollapsedOutlineNodeIds(collapsedNodeIds: Set<NodeId>, nodeId: NodeId): Set<NodeId> {
  const next = new Set(collapsedNodeIds);
  if (next.has(nodeId)) {
    next.delete(nodeId);
  } else {
    next.add(nodeId);
  }
  return next;
}
