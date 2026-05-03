import type { EdgeId, FlowEdge, NodeId } from '../../shared/graph';
import type { LayoutDirection, NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';
import { shouldBendEdge } from './edge-path';
import {
  computeAutoEdgeRoute,
  edgeIntersectsNodeCorridor,
  isForwardIncomingManualEdge,
  routeForwardIncomingConverge,
  type RouteSpacing
} from './edge-routing';
import { DEFAULT_NODE_SIZE } from './node-style';
import type { EdgeBendMap, EdgeRoute, EdgeRouteMap } from './persistence';
import type { NodeBox, Point } from './routing-geometry';

export type RenderedEdgeEndpointResolver = (
  edge: FlowEdge,
  fromPos: NodePosition,
  toPos: NodePosition,
  fromSize: NodeSize,
  toSize: NodeSize
) => { from: Point; to: Point };

export type RouteNodeBoxResolver = (edge: FlowEdge) => Map<NodeId, NodeBox>;

export type BuildEdgeForceBendMapOptions = {
  edges: FlowEdge[];
  renderedPositionMap: Map<NodeId, NodePosition>;
  nodeSizeMap: NodeSizeMap;
  layoutDirection: LayoutDirection;
  layoutEdgeIds: Set<string>;
  useAdvancedAutoRouting: boolean;
  getRenderedEdgeEndpoints: RenderedEdgeEndpointResolver;
  getRouteNodeBoxes: RouteNodeBoxResolver;
  defaultNodeSize?: NodeSize;
};

export type BuildEdgeLaneMapOptions = {
  edges: FlowEdge[];
  renderedPositionMap: Map<NodeId, NodePosition>;
  nodeSizeMap: NodeSizeMap;
  edgeForceBendMap: Map<string, boolean>;
  layoutDirection: LayoutDirection;
  getRenderedEdgeEndpoints: RenderedEdgeEndpointResolver;
  defaultNodeSize?: NodeSize;
};

export type BuildAutoEdgeRouteMapOptions = {
  edges: FlowEdge[];
  renderedPositionMap: Map<NodeId, NodePosition>;
  nodeSizeMap: NodeSizeMap;
  edgeRoutes: EdgeRouteMap;
  edgeBends: EdgeBendMap;
  edgeForceBendMap: Map<string, boolean>;
  edgeLaneMap: Map<string, number>;
  layoutDirection: LayoutDirection;
  layoutEdgeIds: Set<string>;
  layoutSpacing: RouteSpacing;
  convergePrimarySpacing: number;
  useAdvancedAutoRouting: boolean;
  getRenderedEdgeEndpoints: RenderedEdgeEndpointResolver;
  getRouteNodeBoxes: RouteNodeBoxResolver;
  defaultNodeSize?: NodeSize;
};

export function buildEdgeForceBendMap({
  edges,
  renderedPositionMap,
  nodeSizeMap,
  layoutDirection,
  layoutEdgeIds,
  useAdvancedAutoRouting,
  getRenderedEdgeEndpoints,
  getRouteNodeBoxes,
  defaultNodeSize = DEFAULT_NODE_SIZE
}: BuildEdgeForceBendMapOptions): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const edge of edges) {
    const fromPos = renderedPositionMap.get(edge.from);
    const toPos = renderedPositionMap.get(edge.to);
    if (!fromPos || !toPos) continue;
    const fromSize = nodeSizeMap[edge.from] || defaultNodeSize;
    const toSize = nodeSizeMap[edge.to] || defaultNodeSize;
    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
    if (!useAdvancedAutoRouting && edge.role !== 'manual') {
      map.set(edge.id, !layoutEdgeIds.has(edge.id));
      continue;
    }
    const routeNodeBoxes = getRouteNodeBoxes(edge);
    map.set(
      edge.id,
      !layoutEdgeIds.has(edge.id) ||
        edgeIntersectsNodeCorridor(endpoints.from, endpoints.to, layoutDirection, edge.from, edge.to, routeNodeBoxes)
    );
  }
  return map;
}

export function buildEdgeLaneMap({
  edges,
  renderedPositionMap,
  nodeSizeMap,
  edgeForceBendMap,
  layoutDirection,
  getRenderedEdgeEndpoints,
  defaultNodeSize = DEFAULT_NODE_SIZE
}: BuildEdgeLaneMapOptions): Map<string, number> {
  const laneByEdgeId = new Map<string, number>();
  const byFrom = new Map<NodeId, { id: string; delta: number; needsBend: boolean }[]>();
  for (const edge of edges) {
    const fromPos = renderedPositionMap.get(edge.from);
    const toPos = renderedPositionMap.get(edge.to);
    if (!fromPos || !toPos) continue;
    const fromSize = nodeSizeMap[edge.from] || defaultNodeSize;
    const toSize = nodeSizeMap[edge.to] || defaultNodeSize;
    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
    const forceBend = edgeForceBendMap.get(edge.id) || false;
    const needsBend = forceBend || shouldBendEdge(endpoints.from, endpoints.to, layoutDirection, fromSize, toSize);
    if (!needsBend) {
      laneByEdgeId.set(edge.id, 0);
      continue;
    }
    const delta =
      layoutDirection === 'horizontal'
        ? Math.abs(endpoints.to.y - endpoints.from.y)
        : Math.abs(endpoints.to.x - endpoints.from.x);
    const group = byFrom.get(edge.from) || [];
    group.push({ id: edge.id, delta, needsBend });
    byFrom.set(edge.from, group);
  }
  for (const group of byFrom.values()) {
    group.sort((a, b) => a.delta - b.delta || a.id.localeCompare(b.id));
    group.forEach((entry, index) => {
      laneByEdgeId.set(entry.id, index);
    });
  }
  return laneByEdgeId;
}

export function buildAutoEdgeRouteMap({
  edges,
  renderedPositionMap,
  nodeSizeMap,
  edgeRoutes,
  edgeBends,
  edgeForceBendMap,
  edgeLaneMap,
  layoutDirection,
  layoutEdgeIds,
  layoutSpacing,
  convergePrimarySpacing,
  useAdvancedAutoRouting,
  getRenderedEdgeEndpoints,
  getRouteNodeBoxes,
  defaultNodeSize = DEFAULT_NODE_SIZE
}: BuildAutoEdgeRouteMapOptions): Map<string, EdgeRoute> {
  const map = new Map<string, EdgeRoute>();
  const forwardIncomingManualEdgesByTarget = new Map<NodeId, Set<EdgeId>>();

  for (const edge of edges) {
    if (edgeRoutes[edge.id] || edgeBends[edge.id]) continue;
    if (!edgeForceBendMap.get(edge.id)) continue;
    if (!useAdvancedAutoRouting && edge.role !== 'manual') continue;
    const fromPos = renderedPositionMap.get(edge.from);
    const toPos = renderedPositionMap.get(edge.to);
    if (!fromPos || !toPos) continue;
    const fromSize = nodeSizeMap[edge.from] || defaultNodeSize;
    const toSize = nodeSizeMap[edge.to] || defaultNodeSize;
    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
    if (!isForwardIncomingManualEdge(edge, endpoints.from, endpoints.to, layoutDirection, layoutEdgeIds)) {
      continue;
    }
    const group = forwardIncomingManualEdgesByTarget.get(edge.to) || new Set<EdgeId>();
    group.add(edge.id);
    forwardIncomingManualEdgesByTarget.set(edge.to, group);
  }

  for (const edge of edges) {
    if (edgeRoutes[edge.id] || edgeBends[edge.id]) continue;
    if (!edgeForceBendMap.get(edge.id)) continue;
    if (!useAdvancedAutoRouting && edge.role !== 'manual') continue;
    const fromPos = renderedPositionMap.get(edge.from);
    const toPos = renderedPositionMap.get(edge.to);
    if (!fromPos || !toPos) continue;
    const fromSize = nodeSizeMap[edge.from] || defaultNodeSize;
    const toSize = nodeSizeMap[edge.to] || defaultNodeSize;
    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
    const routeNodeBoxes = getRouteNodeBoxes(edge);
    const forwardIncomingManualGroup = forwardIncomingManualEdgesByTarget.get(edge.to);
    const route =
      forwardIncomingManualGroup && forwardIncomingManualGroup.size >= 2 && forwardIncomingManualGroup.has(edge.id)
        ? routeForwardIncomingConverge(endpoints.from, endpoints.to, layoutDirection, convergePrimarySpacing)
        : computeAutoEdgeRoute(
            endpoints.from,
            endpoints.to,
            layoutDirection,
            edge.from,
            edge.to,
            routeNodeBoxes,
            edgeLaneMap.get(edge.id) || 0,
            layoutSpacing,
            edge.anchors
          );
    if (route) map.set(edge.id, route);
  }
  return map;
}
