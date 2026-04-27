import type { FlowDoc, NodeId } from './graph';

export type LayoutDirection = 'horizontal' | 'vertical';

export type NodePosition = {
  id: NodeId;
  x: number;
  y: number;
};

export type LayoutResult = {
  positions: NodePosition[];
};

export type NodeSize = {
  width: number;
  height: number;
};

export type NodeSizeMap = Record<NodeId, NodeSize>;
export type LayoutSpacing = {
  primary: number;
  secondary: number;
};

const GAP_PRIMARY = 56;
const GAP_SECONDARY_HORIZONTAL = 76;
const GAP_SECONDARY_VERTICAL = 140;
const ROOT_GAP_SLOTS = 1;
const START_PRIMARY = 80;
const START_SECONDARY = 80;

function nodeSeq(nodeId: NodeId): number {
  if (!nodeId.startsWith('n')) return Number.MAX_SAFE_INTEGER;
  const value = Number(nodeId.slice(1));
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function compareNodeId(a: NodeId, b: NodeId): number {
  const seqA = nodeSeq(a);
  const seqB = nodeSeq(b);
  if (seqA !== seqB) return seqA - seqB;
  return a.localeCompare(b);
}

export function getLayoutSecondaryGap(direction: LayoutDirection): number {
  return direction === 'horizontal' ? GAP_SECONDARY_HORIZONTAL : GAP_SECONDARY_VERTICAL;
}

function getSpacing(direction: LayoutDirection, spacing?: Partial<LayoutSpacing>): LayoutSpacing {
  return {
    primary: spacing?.primary ?? GAP_PRIMARY,
    secondary: spacing?.secondary ?? getLayoutSecondaryGap(direction)
  };
}

function getNodeSize(nodeSizes: NodeSizeMap | undefined, nodeId: NodeId): NodeSize {
  return nodeSizes?.[nodeId] || { width: 140, height: 56 };
}

function getMaxSecondaryNodeSize(
  doc: FlowDoc,
  direction: LayoutDirection,
  nodeSizes: NodeSizeMap | undefined
): number {
  if (doc.nodes.length === 0) return 0;
  return Math.max(
    ...doc.nodes.map(node => {
      const size = getNodeSize(nodeSizes, node.id);
      return direction === 'horizontal' ? size.height : size.width;
    })
  );
}

function computeDepths(doc: FlowDoc, parentMap: Map<NodeId, NodeId | null>): Map<NodeId, number> {
  const nodeIds = doc.nodes.map(node => node.id);
  const depthMap = new Map<NodeId, number>();

  for (const id of nodeIds) {
    depthMap.set(id, 0);
  }

  for (let i = 0; i < doc.nodes.length; i++) {
    let changed = false;
    for (const nodeId of nodeIds) {
      const parentId = parentMap.get(nodeId);
      if (!parentId || !depthMap.has(parentId)) continue;
      const nextDepth = (depthMap.get(parentId) || 0) + 1;
      if (nextDepth > (depthMap.get(nodeId) || 0)) {
        depthMap.set(nodeId, nextDepth);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const hasRoot = nodeIds.some(id => !parentMap.get(id));
  if (!hasRoot) {
    const sorted = [...nodeIds].sort(compareNodeId);
    sorted.forEach((id, index) => {
      depthMap.set(id, index);
    });
  }

  return depthMap;
}

function depthBuckets(doc: FlowDoc, depthMap: Map<NodeId, number>): Map<number, NodeId[]> {
  const buckets = new Map<number, NodeId[]>();
  for (const node of doc.nodes) {
    const depth = depthMap.get(node.id) || 0;
    if (!buckets.has(depth)) buckets.set(depth, []);
    buckets.get(depth)!.push(node.id);
  }
  return buckets;
}

function edgeSeq(edgeId: string): number {
  if (!edgeId.startsWith('e')) return Number.MAX_SAFE_INTEGER;
  const value = Number(edgeId.slice(1));
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function buildPrimaryParentMap(doc: FlowDoc): Map<NodeId, NodeId | null> {
  const incoming = new Map<NodeId, string[]>();
  const parentByEdge = new Map<string, NodeId>();
  for (const node of doc.nodes) {
    incoming.set(node.id, []);
  }
  for (const edge of doc.edges) {
    if (!incoming.has(edge.to)) continue;
    incoming.get(edge.to)!.push(edge.id);
    parentByEdge.set(edge.id, edge.from);
  }
  for (const edgeIds of incoming.values()) {
    edgeIds.sort((a, b) => edgeSeq(a) - edgeSeq(b));
  }
  const parentMap = new Map<NodeId, NodeId | null>();
  for (const node of doc.nodes) {
    const firstEdgeId = incoming.get(node.id)?.[0];
    parentMap.set(node.id, firstEdgeId ? parentByEdge.get(firstEdgeId) || null : null);
  }
  return parentMap;
}

function buildPrimaryChildrenMap(doc: FlowDoc, parentMap: Map<NodeId, NodeId | null>): Map<NodeId, NodeId[]> {
  const childrenMap = new Map<NodeId, NodeId[]>();
  for (const node of doc.nodes) {
    childrenMap.set(node.id, []);
  }
  for (const [nodeId, parentId] of parentMap.entries()) {
    if (!parentId || !childrenMap.has(parentId)) continue;
    childrenMap.get(parentId)!.push(nodeId);
  }
  for (const children of childrenMap.values()) {
    children.sort(compareNodeId);
  }
  return childrenMap;
}

function assignSecondarySlots(
  roots: NodeId[],
  childrenMap: Map<NodeId, NodeId[]>
): Map<NodeId, number> {
  const secondaryByNode = new Map<NodeId, number>();
  let nextSlot = 0;
  const visiting = new Set<NodeId>();
  const visited = new Set<NodeId>();

  const visit = (nodeId: NodeId): number => {
    if (secondaryByNode.has(nodeId)) return secondaryByNode.get(nodeId)!;
    if (visiting.has(nodeId)) {
      // cycle fallback
      const slot = nextSlot;
      nextSlot += 1;
      secondaryByNode.set(nodeId, slot);
      return slot;
    }
    visiting.add(nodeId);
    const children = (childrenMap.get(nodeId) || []).filter(childId => !visited.has(childId));
    let slot = nextSlot;
    if (children.length === 0) {
      slot = nextSlot;
      nextSlot += 1;
      secondaryByNode.set(nodeId, slot);
    } else {
      const childSlots = children.map(visit);
      const first = Math.min(...childSlots);
      const last = Math.max(...childSlots);
      slot = (first + last) / 2;
      secondaryByNode.set(nodeId, slot);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return slot;
  };

  for (const rootId of roots) {
    visit(rootId);
    nextSlot += ROOT_GAP_SLOTS;
  }
  return secondaryByNode;
}

function enforceDepthSpacingGlobal(
  doc: FlowDoc,
  depthMap: Map<NodeId, number>,
  secondaryByNode: Map<NodeId, number>
) {
  const buckets = depthBuckets(doc, depthMap);
  for (const ids of buckets.values()) {
    const sorted = [...ids].sort(
      (a, b) => (secondaryByNode.get(a) || 0) - (secondaryByNode.get(b) || 0) || compareNodeId(a, b)
    );
    let cursor = Number.NEGATIVE_INFINITY;
    for (const nodeId of sorted) {
      const current = secondaryByNode.get(nodeId) || 0;
      const next = Number.isFinite(cursor) ? Math.max(current, cursor + 1) : current;
      secondaryByNode.set(nodeId, next);
      cursor = next;
    }
  }
}

function shiftPrimarySubtree(
  nodeId: NodeId,
  delta: number,
  childrenMap: Map<NodeId, NodeId[]>,
  secondaryByNode: Map<NodeId, number>,
  visited: Set<NodeId>
) {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);
  secondaryByNode.set(nodeId, (secondaryByNode.get(nodeId) || 0) + delta);
  for (const childId of childrenMap.get(nodeId) || []) {
    shiftPrimarySubtree(childId, delta, childrenMap, secondaryByNode, visited);
  }
}

function applyMultiParentCentering(
  doc: FlowDoc,
  childrenMap: Map<NodeId, NodeId[]>,
  depthMap: Map<NodeId, number>,
  secondaryByNode: Map<NodeId, number>
) {
  const incomingByNode = new Map<NodeId, NodeId[]>();
  for (const node of doc.nodes) incomingByNode.set(node.id, []);
  for (const edge of doc.edges) {
    if (!incomingByNode.has(edge.to)) continue;
    incomingByNode.get(edge.to)!.push(edge.from);
  }

  const nodesByDepth = doc.nodes
    .map(node => node.id)
    .sort((a, b) => (depthMap.get(a) || 0) - (depthMap.get(b) || 0) || compareNodeId(a, b));

  for (const nodeId of nodesByDepth) {
    const nodeDepth = depthMap.get(nodeId) || 0;
    const parents = (incomingByNode.get(nodeId) || []).filter(parentId => {
      const parentDepth = depthMap.get(parentId);
      return typeof parentDepth === 'number' && parentDepth < nodeDepth;
    });
    if (parents.length < 2) continue;
    const parentSlots = parents
      .map(parentId => secondaryByNode.get(parentId))
      .filter((value): value is number => typeof value === 'number');
    if (parentSlots.length < 2) continue;
    const center = parentSlots.reduce((sum, value) => sum + value, 0) / parentSlots.length;
    const current = secondaryByNode.get(nodeId) || 0;
    const delta = center - current;
    if (Math.abs(delta) < 1e-9) continue;
    shiftPrimarySubtree(nodeId, delta, childrenMap, secondaryByNode, new Set<NodeId>());
  }
}

function normalizeSiblingSpacing(
  doc: FlowDoc,
  depthMap: Map<NodeId, number>,
  parentMap: Map<NodeId, NodeId | null>,
  secondaryByNode: Map<NodeId, number>
) {
  const buckets = depthBuckets(doc, depthMap);
  for (const ids of buckets.values()) {
    const byParent = new Map<string, NodeId[]>();
    for (const id of ids) {
      const parentId = parentMap.get(id);
      const key = parentId || '__root__';
      const group = byParent.get(key) || [];
      group.push(id);
      byParent.set(key, group);
    }
    for (const groupIds of byParent.values()) {
      if (groupIds.length <= 1) continue;
      const sorted = [...groupIds].sort(
        (a, b) => (secondaryByNode.get(a) || 0) - (secondaryByNode.get(b) || 0) || compareNodeId(a, b)
      );
      const first = secondaryByNode.get(sorted[0]) || 0;
      const last = secondaryByNode.get(sorted[sorted.length - 1]) || 0;
      const center = (first + last) / 2;
      const start = center - (sorted.length - 1) / 2;
      sorted.forEach((nodeId, index) => {
        secondaryByNode.set(nodeId, start + index);
      });
    }
  }
}

export function layoutFlow(
  doc: FlowDoc,
  direction: LayoutDirection,
  nodeSizes?: NodeSizeMap,
  spacingOptions?: Partial<LayoutSpacing>
): LayoutResult {
  if (doc.nodes.length === 0) return { positions: [] };
  const spacing = getSpacing(direction, spacingOptions);
  const secondaryStep = getMaxSecondaryNodeSize(doc, direction, nodeSizes) + spacing.secondary;

  const parentMap = buildPrimaryParentMap(doc);
  const depths = computeDepths(doc, parentMap);
  const childrenMap = buildPrimaryChildrenMap(doc, parentMap);
  const roots = doc.nodes
    .map(node => node.id)
    .filter(nodeId => !parentMap.get(nodeId))
    .sort(compareNodeId);
  const fallbackRoots =
    roots.length > 0 ? roots : doc.nodes.map(node => node.id).sort(compareNodeId);
  const secondaryByNode = assignSecondarySlots(fallbackRoots, childrenMap);
  applyMultiParentCentering(doc, childrenMap, depths, secondaryByNode);

  const positions: NodePosition[] = [];
  const primaryByNode = new Map<NodeId, number>();
  const sortedNodeIds = doc.nodes.map(node => node.id).sort(compareNodeId);
  const sortedByDepthThenId = [...sortedNodeIds].sort((a, b) => {
    const depthA = depths.get(a) || 0;
    const depthB = depths.get(b) || 0;
    return depthA - depthB || compareNodeId(a, b);
  });
  for (const nodeId of sortedByDepthThenId) {
    const parentId = parentMap.get(nodeId);
    if (!parentId) {
      primaryByNode.set(nodeId, START_PRIMARY);
      continue;
    }
    const parentPrimary = primaryByNode.get(parentId);
    if (typeof parentPrimary !== 'number') {
      const fallbackDepth = depths.get(nodeId) || 0;
      primaryByNode.set(nodeId, START_PRIMARY + fallbackDepth * 176);
      continue;
    }
    const parentSize = getNodeSize(nodeSizes, parentId);
    const parentPrimarySize = direction === 'horizontal' ? parentSize.width : parentSize.height;
    primaryByNode.set(nodeId, parentPrimary + parentPrimarySize + spacing.primary);
  }

  for (const id of sortedNodeIds) {
    const primary = primaryByNode.get(id) || START_PRIMARY;
    const secondary = START_SECONDARY + (secondaryByNode.get(id) || 0) * secondaryStep;
    if (direction === 'horizontal') {
      positions.push({ id, x: primary, y: secondary });
    } else {
      positions.push({ id, x: secondary, y: primary });
    }
  }

  return { positions };
}

export function layoutHorizontal(doc: FlowDoc): LayoutResult {
  return layoutFlow(doc, 'horizontal');
}

export function layoutVertical(doc: FlowDoc): LayoutResult {
  return layoutFlow(doc, 'vertical');
}
