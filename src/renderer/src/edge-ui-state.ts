import type { FlowDoc, NodeId } from '@shared/graph';
import type {
  EdgeBendMap,
  EdgeBendsByDirection,
  EdgeRouteMap,
  EdgeRoutesByDirection
} from './persistence';

export type EdgeUiSnapshot = {
  edgeBendsByDirection: EdgeBendsByDirection;
  edgeRoutesByDirection: EdgeRoutesByDirection;
};

export type InteractionHistoryEntry =
  | { kind: 'doc' }
  | { kind: 'edge-ui'; snapshot: EdgeUiSnapshot };

export type InteractionHistory = {
  past: InteractionHistoryEntry[];
  future: InteractionHistoryEntry[];
};

type EdgeUiHost = {
  edgeBendsByDirection: EdgeBendsByDirection;
  edgeRoutesByDirection: EdgeRoutesByDirection;
};

export function emptyInteractionHistory(): InteractionHistory {
  return { past: [], future: [] };
}

export function cloneEdgeBendMap(map: EdgeBendMap): EdgeBendMap {
  return Object.fromEntries(Object.entries(map).map(([id, bend]) => [id, { ...bend }]));
}

export function cloneEdgeBendsByDirection(value: EdgeBendsByDirection): EdgeBendsByDirection {
  return {
    horizontal: cloneEdgeBendMap(value.horizontal),
    vertical: cloneEdgeBendMap(value.vertical)
  };
}

export function cloneEdgeRouteMap(map: EdgeRouteMap): EdgeRouteMap {
  return Object.fromEntries(
    Object.entries(map).map(([id, route]) => [id, { points: route.points.map(point => ({ ...point })) }])
  );
}

export function cloneEdgeRoutesByDirection(value: EdgeRoutesByDirection): EdgeRoutesByDirection {
  return {
    horizontal: cloneEdgeRouteMap(value.horizontal),
    vertical: cloneEdgeRouteMap(value.vertical)
  };
}

export function translateEdgeBendsForMovedNodes(
  doc: FlowDoc,
  bends: EdgeBendMap,
  movedNodeIds: Set<NodeId>,
  deltaX: number,
  deltaY: number
): EdgeBendMap {
  if (deltaX === 0 && deltaY === 0) return bends;
  let changed = false;
  const next = { ...bends };
  for (const edge of doc.edges) {
    const bend = bends[edge.id];
    if (!bend) continue;
    const fromMoved = movedNodeIds.has(edge.from);
    const toMoved = movedNodeIds.has(edge.to);
    if (!fromMoved && !toMoved) continue;
    if (fromMoved !== toMoved) {
      delete next[edge.id];
      changed = true;
      continue;
    }
    next[edge.id] = { x: bend.x + deltaX, y: bend.y + deltaY };
    changed = true;
  }
  return changed ? next : bends;
}

export function translateEdgeRoutesForMovedNodes(
  doc: FlowDoc,
  routes: EdgeRouteMap,
  movedNodeIds: Set<NodeId>,
  deltaX: number,
  deltaY: number
): EdgeRouteMap {
  if (deltaX === 0 && deltaY === 0) return routes;
  let changed = false;
  const next = { ...routes };
  for (const edge of doc.edges) {
    const route = routes[edge.id];
    if (!route) continue;
    const fromMoved = movedNodeIds.has(edge.from);
    const toMoved = movedNodeIds.has(edge.to);
    if (!fromMoved && !toMoved) continue;
    if (fromMoved !== toMoved) {
      delete next[edge.id];
      changed = true;
      continue;
    }
    next[edge.id] = {
      points: route.points.map(point => ({ x: point.x + deltaX, y: point.y + deltaY }))
    };
    changed = true;
  }
  return changed ? next : routes;
}

export function getEdgeUiSnapshot(host: EdgeUiHost): EdgeUiSnapshot {
  return {
    edgeBendsByDirection: cloneEdgeBendsByDirection(host.edgeBendsByDirection),
    edgeRoutesByDirection: cloneEdgeRoutesByDirection(host.edgeRoutesByDirection)
  };
}

export function applyEdgeUiSnapshot<T extends EdgeUiHost>(host: T, snapshot: EdgeUiSnapshot): T {
  return {
    ...host,
    edgeBendsByDirection: cloneEdgeBendsByDirection(snapshot.edgeBendsByDirection),
    edgeRoutesByDirection: cloneEdgeRoutesByDirection(snapshot.edgeRoutesByDirection)
  };
}

export function edgeUiSnapshotsEqual(a: EdgeUiSnapshot, b: EdgeUiSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function pushInteractionPast(
  past: InteractionHistoryEntry[],
  entry: InteractionHistoryEntry,
  maxPast = 100
): InteractionHistoryEntry[] {
  return past.length >= maxPast ? [...past.slice(1), entry] : [...past, entry];
}
