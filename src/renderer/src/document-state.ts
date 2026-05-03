import { addNode, createEmptyDoc, type FlowDoc } from '../../shared/graph';
import { createHistory, type HistoryState } from '../../shared/history';
import type { LayoutDirection } from '../../shared/layout';
import type { NodeOffsetMap } from '../../shared/local-reflow';
import { emptyInteractionHistory, type InteractionHistory } from './edge-ui-state';
import { ROOT_NODE_STYLE } from './node-style';
import {
  emptyEdgeBendsByDirection,
  emptyEdgeRoutesByDirection,
  emptyOffsetsByDirection,
  type EdgeBendMap,
  type EdgeBendsByDirection,
  type EdgeRouteMap,
  type EdgeRoutesByDirection,
  type NodeOffsetsByDirection
} from './persistence';

export const ROOT_LABEL = '';
export const NEW_NODE_LABEL = '';

export type TabDocument = {
  id: string;
  title: string;
  history: HistoryState<FlowDoc>;
  currentFilePath: string | null;
  isDirty: boolean;
  layoutDirection: LayoutDirection;
  nodeOffsetsByDirection: NodeOffsetsByDirection;
  edgeBendsByDirection: EdgeBendsByDirection;
  edgeRoutesByDirection: EdgeRoutesByDirection;
  toolbarVisible: boolean;
  interactionHistory: InteractionHistory;
};

export function createSeedDoc(): FlowDoc {
  return addNode(createEmptyDoc(), ROOT_LABEL, ROOT_NODE_STYLE);
}

export function ensureDocHasNode(doc: FlowDoc): FlowDoc {
  return doc.nodes.length === 0 ? addNode(doc, ROOT_LABEL, ROOT_NODE_STYLE) : doc;
}

export function createTabDocument(id: string, title: string, doc?: FlowDoc): TabDocument {
  return {
    id,
    title,
    history: createHistory(doc || createSeedDoc()),
    currentFilePath: null,
    isDirty: false,
    layoutDirection: 'horizontal',
    nodeOffsetsByDirection: emptyOffsetsByDirection(),
    edgeBendsByDirection: emptyEdgeBendsByDirection(),
    edgeRoutesByDirection: emptyEdgeRoutesByDirection(),
    toolbarVisible: true,
    interactionHistory: emptyInteractionHistory()
  };
}

function pruneNodeOffsetMap(offsets: NodeOffsetMap, validNodeIds: Set<string>): NodeOffsetMap {
  let changed = false;
  const next: NodeOffsetMap = {};
  for (const [id, offset] of Object.entries(offsets)) {
    if (validNodeIds.has(id)) {
      next[id] = offset;
    } else {
      changed = true;
    }
  }
  return changed ? next : offsets;
}

function pruneEdgeBendMap(bends: EdgeBendMap, validEdgeIds: Set<string>): EdgeBendMap {
  let changed = false;
  const next: EdgeBendMap = {};
  for (const [id, bend] of Object.entries(bends)) {
    if (validEdgeIds.has(id)) {
      next[id] = bend;
    } else {
      changed = true;
    }
  }
  return changed ? next : bends;
}

function pruneEdgeRouteMap(routes: EdgeRouteMap, validEdgeIds: Set<string>): EdgeRouteMap {
  let changed = false;
  const next: EdgeRouteMap = {};
  for (const [id, route] of Object.entries(routes)) {
    if (validEdgeIds.has(id) && route.points.length > 0) {
      next[id] = route;
    } else {
      changed = true;
    }
  }
  return changed ? next : routes;
}

export function pruneTabTransientUiState(tab: TabDocument): TabDocument {
  const validNodeIds = new Set(tab.history.present.nodes.map(node => node.id));
  const validEdgeIds = new Set(tab.history.present.edges.map(edge => edge.id));
  const nextNodeOffsetsByDirection = {
    horizontal: pruneNodeOffsetMap(tab.nodeOffsetsByDirection.horizontal, validNodeIds),
    vertical: pruneNodeOffsetMap(tab.nodeOffsetsByDirection.vertical, validNodeIds)
  };
  const nextEdgeBendsByDirection = {
    horizontal: pruneEdgeBendMap(tab.edgeBendsByDirection.horizontal, validEdgeIds),
    vertical: pruneEdgeBendMap(tab.edgeBendsByDirection.vertical, validEdgeIds)
  };
  const nextEdgeRoutesByDirection = {
    horizontal: pruneEdgeRouteMap(tab.edgeRoutesByDirection.horizontal, validEdgeIds),
    vertical: pruneEdgeRouteMap(tab.edgeRoutesByDirection.vertical, validEdgeIds)
  };

  if (
    nextNodeOffsetsByDirection.horizontal === tab.nodeOffsetsByDirection.horizontal &&
    nextNodeOffsetsByDirection.vertical === tab.nodeOffsetsByDirection.vertical &&
    nextEdgeBendsByDirection.horizontal === tab.edgeBendsByDirection.horizontal &&
    nextEdgeBendsByDirection.vertical === tab.edgeBendsByDirection.vertical &&
    nextEdgeRoutesByDirection.horizontal === tab.edgeRoutesByDirection.horizontal &&
    nextEdgeRoutesByDirection.vertical === tab.edgeRoutesByDirection.vertical
  ) {
    return tab;
  }

  return {
    ...tab,
    nodeOffsetsByDirection: nextNodeOffsetsByDirection,
    edgeBendsByDirection: nextEdgeBendsByDirection,
    edgeRoutesByDirection: nextEdgeRoutesByDirection
  };
}
