import type { FlowEdge, NodeId } from '../../shared/graph';
import type { LayoutDirection, NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';
import { distanceToPathSquared, edgePath, routeFromBend } from './edge-path';
import { DEFAULT_NODE_SIZE } from './node-style';
import type { EdgeBendMap, EdgeRoute, EdgeRouteMap } from './persistence';
import { routeLength, type Point } from './routing-geometry';

export type EdgeEndpointResolver = (
  edge: FlowEdge,
  fromPos: NodePosition,
  toPos: NodePosition,
  fromSize: NodeSize,
  toSize: NodeSize
) => { from: Point; to: Point };

export type EdgeHitCandidate = {
  edgeId: string;
  endpoints: { from: Point; to: Point };
  route: EdgeRoute | undefined;
  distance: number;
  score: number;
};

export type FindEdgeHitOptions = {
  edges: FlowEdge[];
  point: Point;
  preferredEdgeId?: string;
  renderedPositionMap: Map<NodeId, NodePosition>;
  nodeSizeMap: NodeSizeMap;
  defaultNodeSize?: NodeSize;
  layoutDirection: LayoutDirection;
  layoutEdgeIds: Set<string>;
  edgeRoutes: EdgeRouteMap;
  edgeBends: EdgeBendMap;
  autoEdgeRouteMap: Map<string, EdgeRoute>;
  edgeLaneMap: Map<string, number>;
  edgeForceBendMap: Map<string, boolean>;
  getRenderedEdgeEndpoints: EdgeEndpointResolver;
};

export function findEdgeHitAtPoint({
  edges,
  point,
  preferredEdgeId,
  renderedPositionMap,
  nodeSizeMap,
  defaultNodeSize = DEFAULT_NODE_SIZE,
  layoutDirection,
  layoutEdgeIds,
  edgeRoutes,
  edgeBends,
  autoEdgeRouteMap,
  edgeLaneMap,
  edgeForceBendMap,
  getRenderedEdgeEndpoints
}: FindEdgeHitOptions): EdgeHitCandidate | null {
  let best: EdgeHitCandidate | null = null;
  let bestNearbyLayoutEdge: EdgeHitCandidate | null = null;
  let preferred: EdgeHitCandidate | null = null;
  for (const edge of edges) {
    const fromPos = renderedPositionMap.get(edge.from);
    const toPos = renderedPositionMap.get(edge.to);
    if (!fromPos || !toPos) continue;
    const fromSize = nodeSizeMap[edge.from] || defaultNodeSize;
    const toSize = nodeSizeMap[edge.to] || defaultNodeSize;
    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
    const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
    const lane = edgeLaneMap.get(edge.id) || 0;
    const forceBend = edgeForceBendMap.get(edge.id) || false;
    const path = edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, route);
    const distance = distanceToPathSquared(point, path);
    const linearDistance = Math.sqrt(distance);
    const isLayoutEdge = layoutEdgeIds.has(edge.id);
    const isRoutedEdge = Boolean(edgeRoutes[edge.id] || edgeBends[edge.id] || (route && route.points.length > 1));
    const routeDistance = route ? routeLength([endpoints.from, ...route.points, endpoints.to]) : 0;
    const routeLengthPenalty =
      isRoutedEdge && !isLayoutEdge ? Math.min(18, Math.max(0, (routeDistance - 240) / 70)) : 0;
    const routePenalty = linearDistance <= 3 ? 0 : (isLayoutEdge ? 0 : 8) + (isRoutedEdge ? 6 + routeLengthPenalty : 0);
    const preferredBonus = preferredEdgeId === edge.id && distance <= 18 * 18 ? 16 : 0;
    const score = linearDistance + routePenalty - preferredBonus;
    const candidate = { edgeId: edge.id, endpoints, route, distance, score };

    if (preferredEdgeId === edge.id && distance <= 18 * 18) {
      preferred = candidate;
    }
    if (!best || score < best.score || (score === best.score && distance < best.distance)) {
      best = candidate;
    }
    if (isLayoutEdge && distance <= 12 * 12) {
      const layoutScore = linearDistance;
      if (
        !bestNearbyLayoutEdge ||
        layoutScore < bestNearbyLayoutEdge.score ||
        (layoutScore === bestNearbyLayoutEdge.score && distance < bestNearbyLayoutEdge.distance)
      ) {
        bestNearbyLayoutEdge = { ...candidate, score: layoutScore };
      }
    }
  }
  if (bestNearbyLayoutEdge && preferred && !layoutEdgeIds.has(preferred.edgeId)) {
    return bestNearbyLayoutEdge;
  }
  if (preferred) {
    return preferred;
  }
  if (bestNearbyLayoutEdge && best && best.edgeId !== bestNearbyLayoutEdge.edgeId && !layoutEdgeIds.has(best.edgeId)) {
    return bestNearbyLayoutEdge;
  }
  return best && best.distance <= 18 * 18 ? best : null;
}
