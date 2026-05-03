import { reparentNode, type FlowDoc, type NodeId } from '../../shared/graph';
import {
  layoutFlow,
  type LayoutDirection,
  type LayoutSpacing,
  type NodePosition,
  type NodeSize,
  type NodeSizeMap
} from '../../shared/layout';
import { getNodeOffset, type NodeOffset, type NodeOffsetMap } from '../../shared/local-reflow';
import {
  cloneEdgeBendMap,
  cloneEdgeRouteMap,
  translateEdgeBendsForMovedNodes,
  translateEdgeRoutesForMovedNodes
} from './edge-ui-state';
import { getNodeCenter } from './edge-routing';
import { analyzeLayoutEdges, collectEdgeComponent } from './graph-analysis';
import type { EdgeBendMap, EdgeRouteMap } from './persistence';
import { boxesOverlap } from './ui-helpers';

export const NODE_DRAG_THRESHOLD = 3;

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

export type BuildNodeReparentDragResultOptions = {
  doc: FlowDoc;
  movingNodeId: NodeId;
  dropParentTargetId: NodeId;
  anchorRootId: NodeId;
  renderedPositionMap: Map<NodeId, NodePosition>;
  layoutDirection: LayoutDirection;
  nodeSizeMap: NodeSizeMap;
  layoutSpacing: LayoutSpacing;
};

export type BuildNodeDragStartStateOptions = {
  doc: FlowDoc;
  nodeId: NodeId;
  startPoint: { x: number; y: number };
  nodeOffsets: NodeOffsetMap;
  edgeBends: EdgeBendMap;
  edgeRoutes: EdgeRouteMap;
  rootNodeIds: Set<NodeId>;
  layoutEdgeIds: Set<string>;
};

export type NodeReparentDragResult = {
  doc: FlowDoc;
  movingNodeId: NodeId;
  preservedComponentOffset: {
    nodeIds: NodeId[];
    offset: NodeOffset;
  } | null;
};

export type NodeDragFinishPlan =
  | { type: 'root-drag' }
  | { type: 'restore-detached' }
  | { type: 'reparent'; result: NodeReparentDragResult };

export type PlanNodeDragFinishOptions = {
  doc: FlowDoc;
  dragState: NodeDragStateSnapshot;
  dropParentTargetId: NodeId | null;
  rootNodeIds: Set<NodeId>;
  primaryRootNodeId: NodeId;
  renderedPositionMap: Map<NodeId, NodePosition>;
  layoutDirection: LayoutDirection;
  nodeSizeMap: NodeSizeMap;
  layoutSpacing: LayoutSpacing;
};

export function hasNodeDragExceededThreshold(
  dragState: NodeDragStateSnapshot,
  pointer: { x: number; y: number },
  threshold = NODE_DRAG_THRESHOLD
): boolean {
  return Math.hypot(pointer.x - dragState.startX, pointer.y - dragState.startY) >= threshold;
}

export function buildNodeDragStartState({
  doc,
  nodeId,
  startPoint,
  nodeOffsets,
  edgeBends,
  edgeRoutes,
  rootNodeIds,
  layoutEdgeIds
}: BuildNodeDragStartStateOptions): NodeDragStateSnapshot {
  const connectedNodeIds = rootNodeIds.has(nodeId) ? collectEdgeComponent(doc, nodeId, layoutEdgeIds) : [nodeId];
  const startOffsets: Record<NodeId, NodeOffset> = {};
  for (const id of connectedNodeIds) {
    startOffsets[id] = getNodeOffset(nodeOffsets, id);
  }

  return {
    nodeIds: connectedNodeIds,
    anchorNodeId: nodeId,
    startX: startPoint.x,
    startY: startPoint.y,
    startOffsets,
    startEdgeBends: cloneEdgeBendMap(edgeBends),
    startEdgeRoutes: cloneEdgeRouteMap(edgeRoutes)
  };
}

export function applyPreservedComponentOffsetToNodeOffsets(
  prev: NodeOffsetMap,
  preservedComponentOffset: NonNullable<NodeReparentDragResult['preservedComponentOffset']>
): NodeOffsetMap {
  const next = { ...prev };
  const { nodeIds, offset } = preservedComponentOffset;
  for (const nodeId of nodeIds) {
    if (offset.dx === 0 && offset.dy === 0) {
      delete next[nodeId];
    } else {
      next[nodeId] = offset;
    }
  }
  return next;
}

export function planNodeDragFinish({
  doc,
  dragState,
  dropParentTargetId,
  rootNodeIds,
  primaryRootNodeId,
  renderedPositionMap,
  layoutDirection,
  nodeSizeMap,
  layoutSpacing
}: PlanNodeDragFinishOptions): NodeDragFinishPlan {
  const isRootDrag = rootNodeIds.has(dragState.anchorNodeId);
  if (dragState.nodeIds.length === 1 && dropParentTargetId && !isRootDrag) {
    const movingNodeId = dragState.anchorNodeId;
    const anchorRootId = primaryRootNodeId || doc.nodes[0]?.id || movingNodeId;
    return {
      type: 'reparent',
      result: buildNodeReparentDragResult({
        doc,
        movingNodeId,
        dropParentTargetId,
        anchorRootId,
        renderedPositionMap,
        layoutDirection,
        nodeSizeMap,
        layoutSpacing
      })
    };
  }

  return isRootDrag ? { type: 'root-drag' } : { type: 'restore-detached' };
}

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

export function restoreDetachedNodeDragToHost<T extends NodeDragHost>(host: T, dragState: NodeDragStateSnapshot): T {
  const direction = host.layoutDirection;
  const nextOffsets = { ...host.nodeOffsetsByDirection[direction] };
  for (const nodeId of dragState.nodeIds) {
    const startOffset = dragState.startOffsets[nodeId] || { dx: 0, dy: 0 };
    if (startOffset.dx === 0 && startOffset.dy === 0) {
      delete nextOffsets[nodeId];
    } else {
      nextOffsets[nodeId] = startOffset;
    }
  }
  return {
    ...host,
    nodeOffsetsByDirection: {
      ...host.nodeOffsetsByDirection,
      [direction]: nextOffsets
    },
    edgeBendsByDirection: {
      ...host.edgeBendsByDirection,
      [direction]: dragState.startEdgeBends
    },
    edgeRoutesByDirection: {
      ...host.edgeRoutesByDirection,
      [direction]: dragState.startEdgeRoutes
    }
  };
}

export function buildNodeReparentDragResult({
  doc,
  movingNodeId,
  dropParentTargetId,
  anchorRootId,
  renderedPositionMap,
  layoutDirection,
  nodeSizeMap,
  layoutSpacing
}: BuildNodeReparentDragResultOptions): NodeReparentDragResult {
  const nextDoc = reparentNode(doc, movingNodeId, dropParentTargetId);
  const rootRenderedBefore = renderedPositionMap.get(anchorRootId);
  const nextLayoutEdgeAnalysis = analyzeLayoutEdges(nextDoc);
  const nextLayoutDoc = { ...nextDoc, edges: nextLayoutEdgeAnalysis.layoutEdges };
  const nextLayout = layoutFlow(nextLayoutDoc, layoutDirection, nodeSizeMap, layoutSpacing);
  const rootBaseAfter = nextLayout.positions.find(pos => pos.id === anchorRootId);

  if (!rootRenderedBefore || !rootBaseAfter) {
    return {
      doc: nextDoc,
      movingNodeId,
      preservedComponentOffset: null
    };
  }

  return {
    doc: nextDoc,
    movingNodeId,
    preservedComponentOffset: {
      nodeIds: collectEdgeComponent(nextDoc, anchorRootId, nextLayoutEdgeAnalysis.layoutEdgeIds),
      offset: {
        dx: rootRenderedBefore.x - rootBaseAfter.x,
        dy: rootRenderedBefore.y - rootBaseAfter.y
      }
    }
  };
}
