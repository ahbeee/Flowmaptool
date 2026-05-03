import type { EdgeAnchor, EdgeAnchors, NodeId } from '../../shared/graph';
import { resolveDraggedEdgeAnchors } from './connect-anchors';
import type { Point } from './routing-geometry';

export type ConnectDragState = {
  fromNodeId: NodeId;
  anchors: EdgeAnchors;
  start: Point;
  current: Point;
  hoverTargetNodeId: NodeId | null;
};

export type ConnectDragFinishTargetCandidates = {
  handleTargetNodeId?: NodeId | null;
  viewportTargetNodeId?: NodeId | null;
  hoverTargetNodeId?: NodeId | null;
  canvasTargetNodeId?: NodeId | null;
  eventTargetNodeId?: NodeId | null;
  handleAnchor?: EdgeAnchor;
};

export type ConnectDragFinishPlan = {
  fromNodeId: NodeId;
  targetNodeId: NodeId;
  anchors: EdgeAnchors;
};

export function updateConnectDragForPoint(
  drag: ConnectDragState,
  pointer: Point,
  hitNodeId: NodeId | null
): ConnectDragState {
  return {
    ...drag,
    current: pointer,
    hoverTargetNodeId: hitNodeId && hitNodeId !== drag.fromNodeId ? hitNodeId : null
  };
}

export function planConnectDragFinish(
  drag: ConnectDragState,
  {
    handleTargetNodeId,
    viewportTargetNodeId,
    hoverTargetNodeId,
    canvasTargetNodeId,
    eventTargetNodeId,
    handleAnchor
  }: ConnectDragFinishTargetCandidates
): ConnectDragFinishPlan | null {
  const targetNodeId =
    handleTargetNodeId ||
    viewportTargetNodeId ||
    hoverTargetNodeId ||
    canvasTargetNodeId ||
    eventTargetNodeId ||
    null;
  if (!targetNodeId || targetNodeId === drag.fromNodeId) return null;

  const anchors = resolveDraggedEdgeAnchors(
    drag.anchors,
    handleTargetNodeId === targetNodeId ? handleAnchor : undefined
  );
  return anchors ? { fromNodeId: drag.fromNodeId, targetNodeId, anchors } : null;
}
