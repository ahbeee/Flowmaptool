import type { NodeId } from './graph';
import type { LayoutDirection, NodePosition } from './layout';

export type NodeOffset = { dx: number; dy: number };
export type NodeOffsetMap = Record<NodeId, NodeOffset>;
export type LayerReorderPreview = {
  primary: number;
  secondary: number;
  insertionIndex: number;
};

function getPrimary(pos: NodePosition, direction: LayoutDirection): number {
  return direction === 'horizontal' ? pos.x : pos.y;
}

function getSecondary(pos: NodePosition, direction: LayoutDirection): number {
  return direction === 'horizontal' ? pos.y : pos.x;
}

function getCurrentSecondary(
  baseById: Map<NodeId, NodePosition>,
  offsets: NodeOffsetMap,
  nodeId: NodeId,
  direction: LayoutDirection
): number {
  const base = baseById.get(nodeId)!;
  const offset = getNodeOffset(offsets, nodeId);
  return getSecondary(base, direction) + (direction === 'horizontal' ? offset.dy : offset.dx);
}

function computeLayerOrderAfterDrop(
  basePositions: NodePosition[],
  offsets: NodeOffsetMap,
  draggedNodeIds: NodeId[],
  anchorNodeId: NodeId,
  direction: LayoutDirection
) {
  const baseById = new Map(basePositions.map(pos => [pos.id, pos]));
  const anchorBase = baseById.get(anchorNodeId);
  if (!anchorBase) return null;

  const layerNodes = basePositions
    .filter(pos => getPrimary(pos, direction) === getPrimary(anchorBase, direction))
    .map(pos => pos.id);
  if (layerNodes.length <= 1) return null;

  const layerSet = new Set(layerNodes);
  const draggedSet = new Set(draggedNodeIds.filter(id => layerSet.has(id)));
  if (draggedSet.size === 0) return null;

  const sortedByCurrentSecondary = [...layerNodes].sort(
    (a, b) =>
      getCurrentSecondary(baseById, offsets, a, direction) -
      getCurrentSecondary(baseById, offsets, b, direction)
  );

  const draggedInOrder = sortedByCurrentSecondary.filter(id => draggedSet.has(id));
  const nonDraggedInOrder = sortedByCurrentSecondary.filter(id => !draggedSet.has(id));
  if (nonDraggedInOrder.length === 0) return null;

  const anchorSecondary = getCurrentSecondary(baseById, offsets, anchorNodeId, direction);
  const insertionIndex = nonDraggedInOrder.filter(
    id => getCurrentSecondary(baseById, offsets, id, direction) < anchorSecondary
  ).length;

  const merged = [...nonDraggedInOrder];
  merged.splice(insertionIndex, 0, ...draggedInOrder);

  return {
    baseById,
    merged,
    insertionIndex,
    primary: getPrimary(anchorBase, direction)
  };
}

export function getNodeOffset(offsets: NodeOffsetMap, nodeId: NodeId): NodeOffset {
  return offsets[nodeId] || { dx: 0, dy: 0 };
}

export function applyNodeOffset(pos: NodePosition, offset: NodeOffset): NodePosition {
  return {
    id: pos.id,
    x: pos.x + offset.dx,
    y: pos.y + offset.dy
  };
}

export function reorderLayerOnDrop(
  basePositions: NodePosition[],
  offsets: NodeOffsetMap,
  draggedNodeId: NodeId,
  direction: LayoutDirection,
  secondaryGap = 100
): NodeOffsetMap {
  return reorderLayerGroupOnDrop(basePositions, offsets, [draggedNodeId], draggedNodeId, direction, secondaryGap);
}

export function reorderLayerGroupOnDrop(
  basePositions: NodePosition[],
  offsets: NodeOffsetMap,
  draggedNodeIds: NodeId[],
  anchorNodeId: NodeId,
  direction: LayoutDirection,
  secondaryGap = 100
): NodeOffsetMap {
  const plan = computeLayerOrderAfterDrop(basePositions, offsets, draggedNodeIds, anchorNodeId, direction);
  if (!plan) return offsets;

  const secondaryBaseMin = Math.min(
    ...plan.merged.map(id => getSecondary(plan.baseById.get(id)!, direction))
  );

  const nextOffsets: NodeOffsetMap = { ...offsets };
  plan.merged.forEach((id, index) => {
    const base = plan.baseById.get(id)!;
    const desiredSecondary = secondaryBaseMin + index * secondaryGap;
    const currentOffset = getNodeOffset(nextOffsets, id);
    if (direction === 'horizontal') {
      nextOffsets[id] = { dx: currentOffset.dx, dy: desiredSecondary - base.y };
    } else {
      nextOffsets[id] = { dx: desiredSecondary - base.x, dy: currentOffset.dy };
    }
  });

  return nextOffsets;
}

export function getLayerReorderPreview(
  basePositions: NodePosition[],
  offsets: NodeOffsetMap,
  draggedNodeIds: NodeId[],
  anchorNodeId: NodeId,
  direction: LayoutDirection,
  secondaryGap = 100
): LayerReorderPreview | null {
  const plan = computeLayerOrderAfterDrop(basePositions, offsets, draggedNodeIds, anchorNodeId, direction);
  if (!plan) return null;

  const secondaryBaseMin = Math.min(
    ...plan.merged.map(id => getSecondary(plan.baseById.get(id)!, direction))
  );
  return {
    primary: plan.primary,
    secondary: secondaryBaseMin + plan.insertionIndex * secondaryGap,
    insertionIndex: plan.insertionIndex
  };
}

export function compactLayersForNodes(
  basePositions: NodePosition[],
  offsets: NodeOffsetMap,
  movedNodeIds: NodeId[],
  direction: LayoutDirection,
  secondaryGap = 100
): NodeOffsetMap {
  if (movedNodeIds.length === 0) return offsets;
  const baseById = new Map(basePositions.map(pos => [pos.id, pos]));
  const affectedPrimary = new Set<number>();
  for (const id of movedNodeIds) {
    const base = baseById.get(id);
    if (!base) continue;
    affectedPrimary.add(getPrimary(base, direction));
  }
  if (affectedPrimary.size === 0) return offsets;

  let nextOffsets = { ...offsets };
  for (const primary of affectedPrimary) {
    const layerNodes = basePositions
      .filter(pos => getPrimary(pos, direction) === primary)
      .map(pos => pos.id);

    if (layerNodes.length <= 1) continue;
    const anchorSecondary = Math.min(
      ...layerNodes.map(id => getSecondary(baseById.get(id)!, direction))
    );

    const sorted = [...layerNodes].sort((a, b) => {
      const aBase = baseById.get(a)!;
      const bBase = baseById.get(b)!;
      const aOffset = getNodeOffset(nextOffsets, a);
      const bOffset = getNodeOffset(nextOffsets, b);
      const aSecondary =
        getSecondary(aBase, direction) + (direction === 'horizontal' ? aOffset.dy : aOffset.dx);
      const bSecondary =
        getSecondary(bBase, direction) + (direction === 'horizontal' ? bOffset.dy : bOffset.dx);
      return aSecondary - bSecondary;
    });

    sorted.forEach((id, index) => {
      const base = baseById.get(id)!;
      const desiredSecondary = anchorSecondary + index * secondaryGap;
      const currentOffset = getNodeOffset(nextOffsets, id);
      if (direction === 'horizontal') {
        nextOffsets[id] = { dx: currentOffset.dx, dy: desiredSecondary - base.y };
      } else {
        nextOffsets[id] = { dx: desiredSecondary - base.x, dy: currentOffset.dy };
      }
    });
  }
  return nextOffsets;
}
