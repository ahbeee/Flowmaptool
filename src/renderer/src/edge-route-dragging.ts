import type { FlowDoc, FlowEdge, NodeId } from '../../shared/graph';
import type { LayoutDirection, NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';
import {
  getEndpointSpacingOffset,
  routeFromSnappedDraggedControl,
  type DraggedRouteEndpointOffsets,
  type RouteSpacing
} from './edge-routing';
import type { EdgeBendMap, EdgeRoute, EdgeRouteMap } from './persistence';
import { distanceSquared, type NodeBox, type Point } from './routing-geometry';

export const EDGE_SEGMENT_DRAG_THRESHOLD_SQUARED = 16;

export type EdgeRouteDragHost = {
  layoutDirection: LayoutDirection;
  edgeBendsByDirection: Record<LayoutDirection, EdgeBendMap>;
  edgeRoutesByDirection: Record<LayoutDirection, EdgeRouteMap>;
};

export type BuildDraggedEdgeRouteOptions = {
  doc: FlowDoc;
  edgeId: string;
  pointer: Point;
  renderedPositionMap: Map<NodeId, NodePosition>;
  nodeSizeMap: NodeSizeMap;
  defaultNodeSize: NodeSize;
  layoutDirection: LayoutDirection;
  layoutSpacing: RouteSpacing;
  getRouteNodeBoxes: (edge: FlowEdge) => Map<NodeId, NodeBox>;
  getRenderedEdgeEndpoints: (
    edge: FlowEdge,
    fromPos: NodePosition,
    toPos: NodePosition,
    fromSize: NodeSize,
    toSize: NodeSize
  ) => { from: Point; to: Point };
};

export type EdgeSegmentDragMovePlan = { type: 'ignore' } | { type: 'drag'; didDrag: true; suppressNextEdgeClick: true };

export type EdgeSegmentDragFinishPlan = {
  shouldCommitSnapshot: boolean;
  selectedEdgeId: string;
};

export function hasEdgeSegmentDragExceededThreshold(
  start: Point,
  pointer: Point,
  thresholdSquared = EDGE_SEGMENT_DRAG_THRESHOLD_SQUARED
): boolean {
  return distanceSquared(start, pointer) >= thresholdSquared;
}

export function planEdgeSegmentDragMove(start: Point, pointer: Point, didDrag: boolean): EdgeSegmentDragMovePlan {
  if (!didDrag && !hasEdgeSegmentDragExceededThreshold(start, pointer)) return { type: 'ignore' };
  return { type: 'drag', didDrag: true, suppressNextEdgeClick: true };
}

export function planEdgeSegmentDragFinish(edgeId: string, didDrag: boolean): EdgeSegmentDragFinishPlan {
  return {
    shouldCommitSnapshot: didDrag,
    selectedEdgeId: edgeId
  };
}

export function buildDraggedEdgeRoute({
  doc,
  edgeId,
  pointer,
  renderedPositionMap,
  nodeSizeMap,
  defaultNodeSize,
  layoutDirection,
  layoutSpacing,
  getRouteNodeBoxes,
  getRenderedEdgeEndpoints
}: BuildDraggedEdgeRouteOptions): EdgeRoute | undefined {
  const edge = doc.edges.find(candidate => candidate.id === edgeId);
  if (!edge) return undefined;
  const fromPos = renderedPositionMap.get(edge.from);
  const toPos = renderedPositionMap.get(edge.to);
  if (!fromPos || !toPos) return undefined;
  const fromSize = nodeSizeMap[edge.from] || defaultNodeSize;
  const toSize = nodeSizeMap[edge.to] || defaultNodeSize;
  const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
  const endpointOffsets: DraggedRouteEndpointOffsets = {
    source: getEndpointSpacingOffset(layoutSpacing.primary),
    target: getEndpointSpacingOffset(layoutSpacing.primary)
  };
  return routeFromSnappedDraggedControl(
    endpoints.from,
    endpoints.to,
    layoutDirection,
    pointer,
    edge.from,
    edge.to,
    getRouteNodeBoxes(edge),
    layoutSpacing,
    edge.anchors,
    endpointOffsets
  );
}

export function applyDraggedEdgeRouteToHost<T extends EdgeRouteDragHost>(host: T, edgeId: string, route: EdgeRoute): T {
  const direction = host.layoutDirection;
  const { [edgeId]: _removed, ...nextBends } = host.edgeBendsByDirection[direction];
  return {
    ...host,
    edgeBendsByDirection: {
      ...host.edgeBendsByDirection,
      [direction]: nextBends
    },
    edgeRoutesByDirection: {
      ...host.edgeRoutesByDirection,
      [direction]: {
        ...host.edgeRoutesByDirection[direction],
        [edgeId]: route
      }
    }
  };
}
