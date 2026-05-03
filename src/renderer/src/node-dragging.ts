import type { FlowDoc, NodeId } from '../../shared/graph';
import type { NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';
import { getNodeOffset, type NodeOffset, type NodeOffsetMap } from '../../shared/local-reflow';
import { translateEdgeBendsForMovedNodes, translateEdgeRoutesForMovedNodes } from './edge-ui-state';
import { getNodeCenter } from './edge-routing';
import type { EdgeBendMap, EdgeRouteMap } from './persistence';
import { boxesOverlap } from './ui-helpers';

export type NodeDragStateSnapshot = {
  nodeIds: NodeId[];
  anchorNodeId: NodeId;
  startX: number;
  startY: number;
  startOffsets: Record<NodeId, NodeOffset>;
  startEdgeBends: EdgeBendMap;
  startEdgeRoutes: EdgeRouteMap;
};

export type NodeDragHost = {
  layoutDirection: 'horizontal' | 'vertical';
  nodeOffsetsByDirection: Record<'horizontal' | 'vertical', NodeOffsetMap>;
  edgeBendsByDirection: Record<'horizontal' | 'vertical', EdgeBendMap>;
  edgeRoutesByDirection: Record<'horizontal' | 'vertical', EdgeRouteMap>;
};

export type ApplyNodeDragOptions = {
  doc: FlowDoc;
  dragState: NodeDragStateSnapshot;
  pointer: { x: number; y: number };
  basePositions: NodePosition[];
  rootNodeIds: Set<NodeId>;
  nodeSizeMap: NodeSizeMap;
  defaultNodeSize: NodeSize;
  snapThreshold?: number;
  collisionGap?: number;
};

export function applyNodeDragToHost<T extends NodeDragHost>(
  host: T,
  {
    doc,
    dragState,
    pointer,
    basePositions,
    rootNodeIds,
    nodeSizeMap,
    defaultNodeSize,
    snapThreshold = 14,
    collisionGap = 10
  }: ApplyNodeDragOptions
): T {
  const direction = host.layoutDirection;
  const prev = host.nodeOffsetsByDirection[direction];
  const baseById = new Map(basePositions.map(pos => [pos.id, pos]));
  const dragNodeSet = new Set(dragState.nodeIds);
  const deltaX = pointer.x - dragState.startX;
  const deltaY = pointer.y - dragState.startY;
  let next = { ...prev };
  let appliedDeltaX = deltaX;
  let appliedDeltaY = deltaY;

  for (const nodeId of dragState.nodeIds) {
    const startOffset = dragState.startOffsets[nodeId] || { dx: 0, dy: 0 };
    next[nodeId] = { dx: startOffset.dx + deltaX, dy: startOffset.dy + deltaY };
  }

  const anchorBase = baseById.get(dragState.anchorNodeId);
  const anchorSize = nodeSizeMap[dragState.anchorNodeId] || defaultNodeSize;
  if (anchorBase) {
    const anchorOffset = getNodeOffset(next, dragState.anchorNodeId);
    const anchorCenter = getNodeCenter(anchorBase.x + anchorOffset.dx, anchorBase.y + anchorOffset.dy, anchorSize);
    let snapDx = 0;
    let snapDy = 0;
    let bestX = Number.POSITIVE_INFINITY;
    let bestY = Number.POSITIVE_INFINITY;
    for (const rootId of rootNodeIds) {
      if (dragNodeSet.has(rootId)) continue;
      const rootBase = baseById.get(rootId);
      if (!rootBase) continue;
      const rootSize = nodeSizeMap[rootId] || defaultNodeSize;
      const rootOffset = getNodeOffset(prev, rootId);
      const rootCenter = getNodeCenter(rootBase.x + rootOffset.dx, rootBase.y + rootOffset.dy, rootSize);
      const dxToSnap = rootCenter.x - anchorCenter.x;
      const dyToSnap = rootCenter.y - anchorCenter.y;
      if (Math.abs(dxToSnap) <= snapThreshold && Math.abs(dxToSnap) < bestX) {
        bestX = Math.abs(dxToSnap);
        snapDx = dxToSnap;
      }
      if (Math.abs(dyToSnap) <= snapThreshold && Math.abs(dyToSnap) < bestY) {
        bestY = Math.abs(dyToSnap);
        snapDy = dyToSnap;
      }
    }
    if (snapDx !== 0 || snapDy !== 0) {
      const snapped = { ...next };
      for (const nodeId of dragState.nodeIds) {
        const current = getNodeOffset(snapped, nodeId);
        snapped[nodeId] = { dx: current.dx + snapDx, dy: current.dy + snapDy };
      }
      appliedDeltaX += snapDx;
      appliedDeltaY += snapDy;
      next = snapped;
    }
  }

  const staticBoxes = [];
  for (const node of doc.nodes) {
    if (dragNodeSet.has(node.id)) continue;
    const base = baseById.get(node.id);
    if (!base) continue;
    const size = nodeSizeMap[node.id] || defaultNodeSize;
    const offset = getNodeOffset(prev, node.id);
    staticBoxes.push({
      left: base.x + offset.dx,
      right: base.x + offset.dx + size.width,
      top: base.y + offset.dy,
      bottom: base.y + offset.dy + size.height
    });
  }
  for (const nodeId of dragState.nodeIds) {
    const base = baseById.get(nodeId);
    if (!base) continue;
    const size = nodeSizeMap[nodeId] || defaultNodeSize;
    const offset = getNodeOffset(next, nodeId);
    const movingBox = {
      left: base.x + offset.dx,
      right: base.x + offset.dx + size.width,
      top: base.y + offset.dy,
      bottom: base.y + offset.dy + size.height
    };
    if (staticBoxes.some(box => boxesOverlap(movingBox, box, collisionGap))) {
      return host;
    }
  }

  const nextBendsForDirection = translateEdgeBendsForMovedNodes(
    doc,
    dragState.startEdgeBends,
    dragNodeSet,
    appliedDeltaX,
    appliedDeltaY
  );
  const nextRoutesForDirection = translateEdgeRoutesForMovedNodes(
    doc,
    dragState.startEdgeRoutes,
    dragNodeSet,
    appliedDeltaX,
    appliedDeltaY
  );

  return {
    ...host,
    nodeOffsetsByDirection: {
      ...host.nodeOffsetsByDirection,
      [direction]: next
    },
    edgeBendsByDirection: {
      ...host.edgeBendsByDirection,
      [direction]: nextBendsForDirection
    },
    edgeRoutesByDirection: {
      ...host.edgeRoutesByDirection,
      [direction]: nextRoutesForDirection
    }
  };
}
