import { addNode, createEmptyDoc, type FlowDoc } from '../../shared/graph';
import { createHistory, type HistoryState } from '../../shared/history';
import type { LayoutDirection } from '../../shared/layout';
import { emptyInteractionHistory, type InteractionHistory } from './edge-ui-state';
import { ROOT_NODE_STYLE } from './node-style';
import {
  emptyEdgeBendsByDirection,
  emptyEdgeRoutesByDirection,
  emptyOffsetsByDirection,
  type EdgeBendsByDirection,
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
