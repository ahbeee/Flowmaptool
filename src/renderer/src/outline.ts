import type { FlowDoc, FlowEdge, FlowNode, FlowTag, NodeId } from '@shared/graph';

export type OutlineTreeNode = {
  node: FlowNode;
  children: OutlineTreeNode[];
};

export type FilterOutlineTreeResult = {
  tree: OutlineTreeNode[];
  expandedNodeIds: Set<NodeId>;
  matchedNodeIds: Set<NodeId>;
};

export type OutlineChecklistView = 'all' | 'open' | 'done';
export type OutlineMode = 'outline' | 'checklist';
export type OutlineChecklistCounts = Record<OutlineChecklistView, number>;

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

export function filterOutlineTreeByChecklistTargets(
  outlineTree: OutlineTreeNode[],
  checklistTargetsByNodeId: Map<NodeId, NodeId[]>
): OutlineTreeNode[] {
  const visit = (item: OutlineTreeNode): OutlineTreeNode | null => {
    const children = item.children.map(visit).filter((child): child is OutlineTreeNode => Boolean(child));
    const hasChecklistTargets = (checklistTargetsByNodeId.get(item.node.id) || []).length > 0;
    if (!hasChecklistTargets && children.length === 0) return null;
    return {
      node: item.node,
      children
    };
  };

  return outlineTree.map(visit).filter((item): item is OutlineTreeNode => Boolean(item));
}

export function filterOutlineTreeByChecklistView(
  outlineTree: OutlineTreeNode[],
  checklistTargetsByNodeId: Map<NodeId, NodeId[]>,
  isChecklistNodeChecked: (nodeId: NodeId) => boolean,
  view: OutlineChecklistView
): OutlineTreeNode[] {
  if (view === 'all') return outlineTree;

  const visit = (item: OutlineTreeNode): OutlineTreeNode | null => {
    const children = item.children.map(visit).filter((child): child is OutlineTreeNode => Boolean(child));
    const checklistTargets = checklistTargetsByNodeId.get(item.node.id) || [];
    const hasChecklistTargets = checklistTargets.length > 0;
    const done = hasChecklistTargets && checklistTargets.every(isChecklistNodeChecked);
    const matches = hasChecklistTargets && (view === 'done' ? done : !done);
    if (!matches && children.length === 0) return null;
    return {
      node: item.node,
      children
    };
  };

  return outlineTree.map(visit).filter((item): item is OutlineTreeNode => Boolean(item));
}

export function getOutlineChecklistCounts(
  outlineTree: OutlineTreeNode[],
  checklistTargetsByNodeId: Map<NodeId, NodeId[]>,
  isChecklistNodeChecked: (nodeId: NodeId) => boolean
): OutlineChecklistCounts {
  const checklistTargetNodeIds = new Set<NodeId>();
  const visit = (item: OutlineTreeNode) => {
    for (const nodeId of checklistTargetsByNodeId.get(item.node.id) || []) {
      checklistTargetNodeIds.add(nodeId);
    }
    item.children.forEach(visit);
  };
  outlineTree.forEach(visit);

  let done = 0;
  for (const nodeId of checklistTargetNodeIds) {
    if (isChecklistNodeChecked(nodeId)) done++;
  }
  const all = checklistTargetNodeIds.size;
  return {
    all,
    open: all - done,
    done
  };
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

export function collectCollapsibleOutlineNodeIds(tree: OutlineTreeNode[]): NodeId[] {
  const nodeIds: NodeId[] = [];
  const visit = (item: OutlineTreeNode) => {
    if (item.children.length === 0) return;
    nodeIds.push(item.node.id);
    item.children.forEach(visit);
  };
  tree.forEach(visit);
  return nodeIds;
}

export function collectAncestorOutlineNodeIdsForTargets(
  tree: OutlineTreeNode[],
  targetNodeIds: Set<NodeId>
): Set<NodeId> {
  const ancestorNodeIds = new Set<NodeId>();
  const visit = (item: OutlineTreeNode, ancestors: NodeId[]): boolean => {
    const childMatches = item.children.some(child => visit(child, [...ancestors, item.node.id]));
    const matches = targetNodeIds.has(item.node.id);
    if (matches || childMatches) {
      ancestors.forEach(nodeId => ancestorNodeIds.add(nodeId));
      return true;
    }
    return false;
  };
  tree.forEach(item => visit(item, []));
  return ancestorNodeIds;
}

function normalizeOutlineSearchText(value: string | undefined): string {
  return (value || '').trim().toLocaleLowerCase();
}

function getOutlineSearchText(node: FlowNode, tagById: Map<string, FlowTag>): string {
  const tag = node.style?.tagId ? tagById.get(node.style.tagId) : undefined;
  return [
    node.label,
    tag?.name,
    node.task?.status,
    node.task?.priority,
    node.task?.assignee,
    node.task?.note,
    node.task?.dueDate
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export function filterOutlineTree(
  outlineTree: OutlineTreeNode[],
  query: string,
  tagById: Map<string, FlowTag>
): FilterOutlineTreeResult {
  const normalizedQuery = normalizeOutlineSearchText(query);
  if (!normalizedQuery) {
    return {
      tree: outlineTree,
      expandedNodeIds: new Set(),
      matchedNodeIds: new Set()
    };
  }

  const expandedNodeIds = new Set<NodeId>();
  const matchedNodeIds = new Set<NodeId>();

  const visit = (item: OutlineTreeNode): OutlineTreeNode | null => {
    const children = item.children.map(visit).filter((child): child is OutlineTreeNode => Boolean(child));
    const matches = getOutlineSearchText(item.node, tagById).includes(normalizedQuery);
    if (matches) matchedNodeIds.add(item.node.id);
    if (!matches && children.length === 0) return null;
    if (children.length > 0 || (matches && item.children.length > 0)) expandedNodeIds.add(item.node.id);
    return {
      node: item.node,
      children: matches ? item.children : children
    };
  };

  return {
    tree: outlineTree.map(visit).filter((item): item is OutlineTreeNode => Boolean(item)),
    expandedNodeIds,
    matchedNodeIds
  };
}
