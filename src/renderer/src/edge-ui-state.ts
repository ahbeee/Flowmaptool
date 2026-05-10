import type { EdgeId, FlowDoc, FlowEdge, NodeId } from '@shared/graph';
import { redoHistory, undoHistory, type HistoryState } from '../../shared/history';
import type { EdgeBendMap, EdgeBendsByDirection, EdgeRouteMap, EdgeRoutesByDirection } from './persistence';

export type EdgeUiSnapshot = {
  edgeBendsByDirection: EdgeBendsByDirection;
  edgeRoutesByDirection: EdgeRoutesByDirection;
};

export type InteractionHistoryEntry = { kind: 'doc' } | { kind: 'edge-ui'; snapshot: EdgeUiSnapshot };

export type InteractionHistory = {
  past: InteractionHistoryEntry[];
  future: InteractionHistoryEntry[];
};

type EdgeUiHost = {
  edgeBendsByDirection: EdgeBendsByDirection;
  edgeRoutesByDirection: EdgeRoutesByDirection;
};

export type ClearEdgeUiForLayoutMutationOptions = {
  affectedEdgeIds?: Set<EdgeId>;
};

type InteractionHost = EdgeUiHost & {
  history: HistoryState<FlowDoc>;
  isDirty: boolean;
  interactionHistory: InteractionHistory;
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

function docLayoutSignature(doc: FlowDoc): string {
  return JSON.stringify({
    nodes: doc.nodes.map(node => ({
      id: node.id,
      label: node.label,
      style: node.style
    })),
    spacing: doc.settings.spacing
  });
}

function docEdgeSignature(doc: FlowDoc): Map<EdgeId, Pick<FlowEdge, 'from' | 'to' | 'role' | 'anchors'>> {
  return new Map(
    doc.edges.map(edge => [
      edge.id,
      {
        from: edge.from,
        to: edge.to,
        role: edge.role,
        anchors: edge.anchors
      }
    ])
  );
}

function hasAnyEdgeUiState(snapshot: EdgeUiSnapshot): boolean {
  return (
    Object.keys(snapshot.edgeBendsByDirection.horizontal).length > 0 ||
    Object.keys(snapshot.edgeBendsByDirection.vertical).length > 0 ||
    Object.keys(snapshot.edgeRoutesByDirection.horizontal).length > 0 ||
    Object.keys(snapshot.edgeRoutesByDirection.vertical).length > 0
  );
}

function clearAllEdgeUi<T extends EdgeUiHost>(host: T): T {
  return {
    ...host,
    edgeBendsByDirection: { horizontal: {}, vertical: {} },
    edgeRoutesByDirection: { horizontal: {}, vertical: {} }
  };
}

function pruneEdgeUiByIds<T extends EdgeUiHost>(host: T, removedEdgeIds: Set<EdgeId>): T {
  if (removedEdgeIds.size === 0) return host;
  let changed = false;
  const pruneBends = (bends: EdgeBendMap): EdgeBendMap => {
    const next = Object.fromEntries(Object.entries(bends).filter(([edgeId]) => !removedEdgeIds.has(edgeId)));
    if (Object.keys(next).length !== Object.keys(bends).length) changed = true;
    return next;
  };
  const pruneRoutes = (routes: EdgeRouteMap): EdgeRouteMap => {
    const next = Object.fromEntries(Object.entries(routes).filter(([edgeId]) => !removedEdgeIds.has(edgeId)));
    if (Object.keys(next).length !== Object.keys(routes).length) changed = true;
    return next;
  };
  const nextHost = {
    ...host,
    edgeBendsByDirection: {
      horizontal: pruneBends(host.edgeBendsByDirection.horizontal),
      vertical: pruneBends(host.edgeBendsByDirection.vertical)
    },
    edgeRoutesByDirection: {
      horizontal: pruneRoutes(host.edgeRoutesByDirection.horizontal),
      vertical: pruneRoutes(host.edgeRoutesByDirection.vertical)
    }
  };
  return changed ? nextHost : host;
}

export function clearEdgeUiForLayoutMutation<T extends EdgeUiHost>(
  host: T,
  beforeDoc: FlowDoc,
  afterDoc: FlowDoc,
  options: ClearEdgeUiForLayoutMutationOptions = {}
): T {
  if (beforeDoc === afterDoc) return host;
  if (!hasAnyEdgeUiState(host)) return host;
  if (docLayoutSignature(beforeDoc) !== docLayoutSignature(afterDoc) && options.affectedEdgeIds) {
    return pruneEdgeUiByIds(host, options.affectedEdgeIds);
  }
  if (docLayoutSignature(beforeDoc) === docLayoutSignature(afterDoc)) {
    const beforeEdges = docEdgeSignature(beforeDoc);
    const afterEdges = docEdgeSignature(afterDoc);
    const changedEdges = new Set<EdgeId>();
    for (const [edgeId, beforeEdge] of beforeEdges) {
      const afterEdge = afterEdges.get(edgeId);
      if (
        !afterEdge ||
        beforeEdge.from !== afterEdge.from ||
        beforeEdge.to !== afterEdge.to ||
        beforeEdge.role !== afterEdge.role ||
        JSON.stringify(beforeEdge.anchors || null) !== JSON.stringify(afterEdge.anchors || null)
      ) {
        changedEdges.add(edgeId);
      }
    }
    for (const [edgeId, afterEdge] of afterEdges) {
      const beforeEdge = beforeEdges.get(edgeId);
      if (!beforeEdge) changedEdges.add(edgeId);
    }
    const hasLayoutEdgeChange = [...changedEdges].some(edgeId => {
      const beforeEdge = beforeEdges.get(edgeId);
      const afterEdge = afterEdges.get(edgeId);
      if (!beforeEdge) return afterEdge?.role !== 'manual';
      if (!afterEdge) return beforeEdge.role !== 'manual';
      return beforeEdge.role !== 'manual' || afterEdge.role !== 'manual';
    });
    if (hasLayoutEdgeChange) {
      return clearAllEdgeUi(host);
    }

    const keptEdgeIds = new Set<EdgeId>();
    let changed = false;
    for (const afterEdge of afterDoc.edges) {
      const beforeEdge = beforeEdges.get(afterEdge.id);
      if (
        beforeEdge &&
        beforeEdge.from === afterEdge.from &&
        beforeEdge.to === afterEdge.to &&
        beforeEdge.role === afterEdge.role &&
        JSON.stringify(beforeEdge.anchors || null) === JSON.stringify(afterEdge.anchors || null)
      ) {
        keptEdgeIds.add(afterEdge.id);
      }
    }
    const pruneBends = (bends: EdgeBendMap): EdgeBendMap => {
      const next = Object.fromEntries(Object.entries(bends).filter(([edgeId]) => keptEdgeIds.has(edgeId)));
      if (Object.keys(next).length !== Object.keys(bends).length) changed = true;
      return next;
    };
    const pruneRoutes = (routes: EdgeRouteMap): EdgeRouteMap => {
      const next = Object.fromEntries(Object.entries(routes).filter(([edgeId]) => keptEdgeIds.has(edgeId)));
      if (Object.keys(next).length !== Object.keys(routes).length) changed = true;
      return next;
    };
    const nextHost = {
      ...host,
      edgeBendsByDirection: {
        horizontal: pruneBends(host.edgeBendsByDirection.horizontal),
        vertical: pruneBends(host.edgeBendsByDirection.vertical)
      },
      edgeRoutesByDirection: {
        horizontal: pruneRoutes(host.edgeRoutesByDirection.horizontal),
        vertical: pruneRoutes(host.edgeRoutesByDirection.vertical)
      }
    };
    return changed ? nextHost : host;
  }
  return clearAllEdgeUi(host);
}

export function pushInteractionPast(
  past: InteractionHistoryEntry[],
  entry: InteractionHistoryEntry,
  maxPast = 100
): InteractionHistoryEntry[] {
  return past.length >= maxPast ? [...past.slice(1), entry] : [...past, entry];
}

export function commitEdgeUiChangeToHost<T extends InteractionHost>(
  host: T,
  recipe: (snapshot: EdgeUiSnapshot, layoutDirection: 'horizontal' | 'vertical') => EdgeUiSnapshot,
  layoutDirection: 'horizontal' | 'vertical'
): T {
  const before = getEdgeUiSnapshot(host);
  const after = recipe(before, layoutDirection);
  if (edgeUiSnapshotsEqual(before, after)) return host;
  return {
    ...applyEdgeUiSnapshot(host, after),
    isDirty: true,
    interactionHistory: {
      past: pushInteractionPast(host.interactionHistory.past, { kind: 'edge-ui', snapshot: before }),
      future: []
    }
  };
}

export function commitCurrentEdgeUiSnapshotToHost<T extends InteractionHost>(
  host: T,
  before: EdgeUiSnapshot | null
): T {
  if (!before) return host;
  const after = getEdgeUiSnapshot(host);
  if (edgeUiSnapshotsEqual(before, after)) return host;
  return {
    ...host,
    isDirty: true,
    interactionHistory: {
      past: pushInteractionPast(host.interactionHistory.past, { kind: 'edge-ui', snapshot: before }),
      future: []
    }
  };
}

export function commitDocHistoryToHost<T extends InteractionHost>(host: T, nextHistory: HistoryState<FlowDoc>): T {
  return {
    ...host,
    history: nextHistory,
    interactionHistory:
      nextHistory === host.history
        ? host.interactionHistory
        : {
            past: pushInteractionPast(host.interactionHistory.past, { kind: 'doc' }),
            future: []
          },
    isDirty: true
  };
}

export function undoInteractionInHost<T extends InteractionHost>(host: T): T {
  const entry = host.interactionHistory.past[host.interactionHistory.past.length - 1];
  if (!entry) {
    const nextHistory = undoHistory(host.history);
    return nextHistory === host.history ? host : { ...host, history: nextHistory, isDirty: true };
  }
  const base = {
    ...host,
    isDirty: true,
    interactionHistory: {
      past: host.interactionHistory.past.slice(0, -1),
      future: [
        entry.kind === 'edge-ui'
          ? { kind: 'edge-ui' as const, snapshot: getEdgeUiSnapshot(host) }
          : { kind: 'doc' as const },
        ...host.interactionHistory.future
      ]
    }
  };
  return entry.kind === 'edge-ui'
    ? applyEdgeUiSnapshot(base, entry.snapshot)
    : { ...base, history: undoHistory(host.history) };
}

export function redoInteractionInHost<T extends InteractionHost>(host: T): T {
  const entry = host.interactionHistory.future[0];
  if (!entry) {
    const nextHistory = redoHistory(host.history);
    return nextHistory === host.history ? host : { ...host, history: nextHistory, isDirty: true };
  }
  const base = {
    ...host,
    isDirty: true,
    interactionHistory: {
      past: pushInteractionPast(
        host.interactionHistory.past,
        entry.kind === 'edge-ui'
          ? { kind: 'edge-ui' as const, snapshot: getEdgeUiSnapshot(host) }
          : { kind: 'doc' as const }
      ),
      future: host.interactionHistory.future.slice(1)
    }
  };
  return entry.kind === 'edge-ui'
    ? applyEdgeUiSnapshot(base, entry.snapshot)
    : { ...base, history: redoHistory(host.history) };
}
