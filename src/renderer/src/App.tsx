import React from 'react';
import {
  addEdge,
  addNode,
  createEmptyDoc,
  deleteTag,
  reparentNode,
  removeEdge,
  removeNodes,
  resetNodeStyle,
  setNodeChecked,
  updateEdgeStyle,
  updateNodeLabel,
  updateNodeStyle,
  updateNodeTask,
  updateSettings,
  upsertTag,
  validateEdge,
  type FlowEdge,
  type FlowTag,
  type FlowDoc,
  type EdgeLineType,
  type EdgeAnchor,
  type EdgeAnchors,
  type EdgeId,
  type EdgeStyle,
  type FlowNode,
  type NodeId,
  type NodeShape,
  type NodeStyle,
  type NodeTask,
  type TaskPriority,
  type TextAlign
} from '@shared/graph';
import {
  commitHistory,
  createHistory,
  redoHistory,
  type HistoryState,
  undoHistory
} from '@shared/history';
import {
  getLayoutSecondaryGap,
  layoutFlow,
  type LayoutDirection,
  type NodeSize,
  type NodeSizeMap
} from '@shared/layout';
import {
  applyNodeOffset,
  getLayerReorderPreview,
  getNodeOffset,
  type NodeOffset,
  type NodeOffsetMap
} from '@shared/local-reflow';
import { extractSelection, pasteDetached, type CopiedSelection } from '@shared/subflow';
import { basename, bytesToBase64, escapeXml } from './export-utils';
import { buildOutlineChecklistTargetsByNodeId, buildOutlineTree, type OutlineTreeNode } from './outline';
import {
  emptyEdgeBendsByDirection,
  emptyEdgeRoutesByDirection,
  emptyOffsetsByDirection,
  parsePersistedQflow,
  serializePersistedQflow,
  type EdgeBend,
  type EdgeBendMap,
  type EdgeBendsByDirection,
  type EdgeRoute,
  type EdgeRouteMap,
  type EdgeRoutesByDirection,
  type NodeOffsetsByDirection
} from './persistence';
import {
  distanceSquared,
  distanceToSegmentSquared,
  pointInsideBox,
  routeClearancePenalty,
  routeLength,
  routeObstacleCount,
  routeTurnCount,
  segmentIntersectsBox,
  segmentsIntersect
} from './routing-geometry';
import {
  buildTaskTableRows,
  getTaskNodeLabel,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_TABLE_COLUMNS,
  type TaskTableSort,
  type TaskTableSortKey
} from './task-table';

const DEFAULT_NODE_SIZE: NodeSize = { width: 70, height: 28 };
const NODE_MIN_WIDTH = 48;
const NODE_MAX_WIDTH = 360;
const NODE_MIN_HEIGHT = 28;
const NODE_PADDING_X = 10;
const NODE_PADDING_Y = 6;
const NODE_TEXT_BASELINE_Y = 26;
const NODE_TEXT_MAX_LEN = 80;
const ROOT_LABEL = '';
const NEW_NODE_LABEL = '';
const DEFAULT_FONT_FAMILY = 'Roboto';
const DEFAULT_FONT_SIZE = 12;
const HANDLE_CONNECT_ANCHORS: EdgeAnchors = { from: 'back', to: 'body' };
const FRONT_HANDLE_CONNECT_ANCHORS: EdgeAnchors = { from: 'front', to: 'body' };
const ROOT_NODE_STYLE: NodeStyle = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  shape: 'rounded'
};
const CHILD_NODE_STYLE: NodeStyle = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  shape: 'plain'
};
const SPACING_MIN = 0;
const SPACING_MAX = 320;
const SIDE_PANEL_MIN_WIDTH = 220;
const SIDE_PANEL_DEFAULT_WIDTH = 360;
const SIDE_PANEL_MAX_WIDTH = 760;
const ADVANCED_ROUTE_NODE_LIMIT = 300;
const ADVANCED_ROUTE_EDGE_LIMIT = 800;
const FONT_FAMILIES = ['Roboto', 'Segoe UI', 'Arial', 'Microsoft JhengHei', 'Noto Sans TC'];
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 32, 48, 64];
const EDGE_WIDTHS = [1, 2, 3, 4, 5, 6, 7, 8];
const EDGE_LINE_TYPES: Array<{ value: EdgeLineType; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' }
];
const MIXED_OPTION = '__mixed__';
const COLOR_SWATCHES = [
  '#111827',
  '#6b7280',
  '#b91c1c',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#0ea5e9',
  '#4f46e5',
  '#a855f7',
  '#ffffff',
  '#e5e7eb',
  '#c08457',
  '#f9a8d4',
  '#fbbf24',
  '#f5e7a1',
  '#a3e635',
  '#67e8f9',
  '#93c5fd',
  '#c4b5fd'
];
const NODE_SHAPES: Array<{ value: NodeShape; label: string }> = [
  { value: 'plain', label: 'No Frame' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'pill', label: 'Pill' },
  { value: 'underline', label: 'Underline' },
  { value: 'square', label: 'Square' }
];
const THEMES = {
  'blue-gray': {
    label: 'Blue Gray',
    canvas: '#f8fafc',
    rootBg: '#1f2937',
    rootText: '#ffffff',
    nodeBg: '#ffffff',
    nodeText: '#0f172a',
    edge: '#64748b'
  },
  'gray-red': {
    label: 'Gray Red',
    canvas: '#eef2f3',
    rootBg: '#102027',
    rootText: '#ffffff',
    nodeBg: '#d1d5db',
    nodeText: '#111827',
    edge: '#b91c1c'
  },
  clean: {
    label: 'Light Clean',
    canvas: '#ffffff',
    rootBg: '#111827',
    rootText: '#ffffff',
    nodeBg: '#f8fafc',
    nodeText: '#111827',
    edge: '#38bdf8'
  },
  dark: {
    label: 'Dark Contrast',
    canvas: '#111827',
    rootBg: '#f8fafc',
    rootText: '#111827',
    nodeBg: '#1f2937',
    nodeText: '#f8fafc',
    edge: '#93c5fd'
  }
} as const;
type ThemeId = keyof typeof THEMES;

type Point = { x: number; y: number };
type LayoutPoint = { x: number; y: number };
type NodeBox = { left: number; right: number; top: number; bottom: number };
type DragState = {
  nodeIds: NodeId[];
  anchorNodeId: NodeId;
  startX: number;
  startY: number;
  startOffsets: Record<NodeId, NodeOffset>;
  startEdgeBends: EdgeBendMap;
  startEdgeRoutes: EdgeRouteMap;
};
type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
type RouteSpacing = { primary: number; secondary: number };
type DraggedRouteEndpointOffsets = {
  source?: number;
  target?: number;
};
type EdgeUiSnapshot = {
  edgeBendsByDirection: EdgeBendsByDirection;
  edgeRoutesByDirection: EdgeRoutesByDirection;
};
type InteractionHistoryEntry =
  | { kind: 'doc' }
  | { kind: 'edge-ui'; snapshot: EdgeUiSnapshot };
type InteractionHistory = {
  past: InteractionHistoryEntry[];
  future: InteractionHistoryEntry[];
};
type EdgeBendDragState = { edgeId: string; pointIndex: number };
type EdgeRouteControlSelection = { edgeId: string; pointIndex: number };
type SidePanelResizeState = { pointerId: number; startX: number; startWidth: number };
type ConnectDragState = {
  fromNodeId: NodeId;
  anchors: EdgeAnchors;
  start: Point;
  current: Point;
  hoverTargetNodeId: NodeId | null;
};
type DragPointerLikeEvent = {
  clientX: number;
  clientY: number;
  target?: EventTarget | null;
};
type SvgEdgeSnapshot = {
  id: string;
  from: Point;
  to: Point;
  lane: number;
  fromSize: NodeSize;
  toSize: NodeSize;
  forceBend: boolean;
  style: Required<EdgeStyle>;
  route?: EdgeRoute;
};

type LayoutEdgeAnalysis = {
  layoutEdges: FlowEdge[];
  layoutEdgeIds: Set<string>;
  rootNodeIds: Set<NodeId>;
};
type SvgNodeSnapshot = {
  id: NodeId;
  label: string;
  style: NodeStyle | undefined;
  isRoot: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};
type TabDocument = {
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

const PNG_FILTER = [{ name: 'PNG Image', extensions: ['png'] }];

function createChildNodeStyle(defaultShape: NodeShape): NodeStyle {
  return {
    ...CHILD_NODE_STYLE,
    shape: defaultShape
  };
}

function reverseEdgeAnchors(anchors: EdgeAnchors | undefined): EdgeAnchors | undefined {
  if (!anchors) return undefined;
  return {
    ...(anchors.to ? { from: anchors.to } : {}),
    ...(anchors.from ? { to: anchors.from } : {})
  };
}

function isNodeSideAnchor(anchor: EdgeAnchors['from'] | undefined): anchor is 'front' | 'back' {
  return anchor === 'front' || anchor === 'back';
}

function oppositeNodeSideAnchor(anchor: 'front' | 'back'): 'front' | 'back' {
  return anchor === 'front' ? 'back' : 'front';
}

function emptyInteractionHistory(): InteractionHistory {
  return { past: [], future: [] };
}

function cloneEdgeBendMap(map: EdgeBendMap): EdgeBendMap {
  return Object.fromEntries(Object.entries(map).map(([id, bend]) => [id, { ...bend }]));
}

function cloneEdgeBendsByDirection(value: EdgeBendsByDirection): EdgeBendsByDirection {
  return {
    horizontal: cloneEdgeBendMap(value.horizontal),
    vertical: cloneEdgeBendMap(value.vertical)
  };
}

function cloneEdgeRouteMap(map: EdgeRouteMap): EdgeRouteMap {
  return Object.fromEntries(
    Object.entries(map).map(([id, route]) => [id, { points: route.points.map(point => ({ ...point })) }])
  );
}

function cloneEdgeRoutesByDirection(value: EdgeRoutesByDirection): EdgeRoutesByDirection {
  return {
    horizontal: cloneEdgeRouteMap(value.horizontal),
    vertical: cloneEdgeRouteMap(value.vertical)
  };
}

function translateEdgeBendsForMovedNodes(
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

function translateEdgeRoutesForMovedNodes(
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

function getEdgeUiSnapshot(tab: TabDocument): EdgeUiSnapshot {
  return {
    edgeBendsByDirection: cloneEdgeBendsByDirection(tab.edgeBendsByDirection),
    edgeRoutesByDirection: cloneEdgeRoutesByDirection(tab.edgeRoutesByDirection)
  };
}

function applyEdgeUiSnapshot(tab: TabDocument, snapshot: EdgeUiSnapshot): TabDocument {
  return {
    ...tab,
    edgeBendsByDirection: cloneEdgeBendsByDirection(snapshot.edgeBendsByDirection),
    edgeRoutesByDirection: cloneEdgeRoutesByDirection(snapshot.edgeRoutesByDirection)
  };
}

function edgeUiSnapshotsEqual(a: EdgeUiSnapshot, b: EdgeUiSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pushInteractionPast(
  past: InteractionHistoryEntry[],
  entry: InteractionHistoryEntry,
  maxPast = 100
): InteractionHistoryEntry[] {
  return past.length >= maxPast ? [...past.slice(1), entry] : [...past, entry];
}

function createSeedDoc(): FlowDoc {
  return addNode(createEmptyDoc(), ROOT_LABEL, ROOT_NODE_STYLE);
}

function ensureDocHasNode(doc: FlowDoc): FlowDoc {
  return doc.nodes.length === 0 ? addNode(doc, ROOT_LABEL, ROOT_NODE_STYLE) : doc;
}

function createTabDocument(id: string, title: string, doc?: FlowDoc): TabDocument {
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

function getTheme(themeId: string) {
  return THEMES[(themeId as ThemeId) in THEMES ? (themeId as ThemeId) : 'blue-gray'];
}

let nodeMeasureCanvas: HTMLCanvasElement | null = null;

function getNodeMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  nodeMeasureCanvas = nodeMeasureCanvas || document.createElement('canvas');
  return nodeMeasureCanvas.getContext('2d');
}

function quoteFontFamily(fontFamily: string): string {
  return /^[a-zA-Z0-9-]+$/.test(fontFamily) ? fontFamily : `"${fontFamily.replace(/"/g, '\\"')}"`;
}

function fallbackTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    width += /[\u2e80-\u9fff\uff00-\uffef]/.test(char) ? fontSize : fontSize * 0.52;
  }
  return width;
}

function measureNodeTextWidth(text: string, style?: NodeStyle): number {
  const fontSize = style?.fontSize || DEFAULT_FONT_SIZE;
  const fontFamily = style?.fontFamily || DEFAULT_FONT_FAMILY;
  const context = getNodeMeasureContext();
  if (!context) return fallbackTextWidth(text, fontSize);
  context.font = `${fontSize}px ${quoteFontFamily(fontFamily)}, sans-serif`;
  return context.measureText(text).width;
}

function estimateNodeSize(label: string, style?: NodeStyle): NodeSize {
  const singleLine = clampNodeLabel(label).replace(/\r?\n/g, ' ');
  const fontSize = style?.fontSize || DEFAULT_FONT_SIZE;
  const unclampedWidth = measureNodeTextWidth(singleLine, style) + NODE_PADDING_X * 2 + 10;
  const width = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, unclampedWidth || NODE_MIN_WIDTH));
  const height = Math.max(NODE_MIN_HEIGHT, Math.ceil(fontSize * 1.3 + NODE_PADDING_Y * 2));
  return { width, height };
}

function getNodeCenter(x: number, y: number, size: NodeSize): Point {
  return { x: x + size.width / 2, y: y + size.height / 2 };
}

function getEdgeEndpoints(
  from: LayoutPoint,
  to: LayoutPoint,
  direction: LayoutDirection,
  fromSize: NodeSize,
  toSize: NodeSize
): { from: Point; to: Point } {
  const fromCenter = getNodeCenter(from.x, from.y, fromSize);
  const toCenter = getNodeCenter(to.x, to.y, toSize);
  if (direction === 'vertical') {
    return {
      from: { x: fromCenter.x, y: from.y + fromSize.height },
      to: { x: toCenter.x, y: to.y }
    };
  }
  return {
    from: { x: from.x + fromSize.width, y: fromCenter.y },
    to: { x: to.x, y: toCenter.y }
  };
}

function getDirectionalAnchorPoint(
  pos: LayoutPoint,
  size: NodeSize,
  direction: LayoutDirection,
  anchor: 'front' | 'back'
): Point {
  const center = getNodeCenter(pos.x, pos.y, size);
  if (direction === 'vertical') {
    return anchor === 'front'
      ? { x: center.x, y: pos.y }
      : { x: center.x, y: pos.y + size.height };
  }
  return anchor === 'front'
    ? { x: pos.x, y: center.y }
    : { x: pos.x + size.width, y: center.y };
}

function getBodyAnchorPoint(pos: LayoutPoint, size: NodeSize, other: Point): Point {
  const center = getNodeCenter(pos.x, pos.y, size);
  const dx = other.x - center.x;
  const dy = other.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0
      ? { x: pos.x, y: center.y }
      : { x: pos.x + size.width, y: center.y };
  }
  return dy < 0
    ? { x: center.x, y: pos.y }
    : { x: center.x, y: pos.y + size.height };
}

function getAnchoredPoint(
  pos: LayoutPoint,
  size: NodeSize,
  direction: LayoutDirection,
  anchor: EdgeAnchors['from'],
  autoPoint: Point,
  otherPoint: Point,
  isTarget = false
): Point {
  if (anchor === 'front' || anchor === 'back') return getDirectionalAnchorPoint(pos, size, direction, anchor);
  if (anchor === 'body' && isTarget) return getDirectionalAnchorPoint(pos, size, direction, 'front');
  if (anchor === 'body') return getBodyAnchorPoint(pos, size, otherPoint);
  return autoPoint;
}

function getEdgeRenderEndpoints(
  edge: FlowEdge,
  from: LayoutPoint,
  to: LayoutPoint,
  direction: LayoutDirection,
  fromSize: NodeSize,
  toSize: NodeSize,
  isLayoutEdge: boolean,
  targetIsRoot: boolean
): { from: Point; to: Point } {
  const endpoints = getEdgeEndpoints(from, to, direction, fromSize, toSize);
  if (edge.anchors) {
    const fromPoint = getAnchoredPoint(
      from,
      fromSize,
      direction,
      edge.anchors.from,
      endpoints.from,
      endpoints.to
    );
    const toPoint = getAnchoredPoint(
      to,
      toSize,
      direction,
      edge.anchors.to,
      endpoints.to,
      fromPoint,
      true
    );
    return { from: fromPoint, to: toPoint };
  }
  if (isLayoutEdge || targetIsRoot) return endpoints;

  const fromCenter = getNodeCenter(from.x, from.y, fromSize);
  const toCenter = getNodeCenter(to.x, to.y, toSize);
  if (direction === 'vertical') {
    const targetIsAboveSource = to.y + toSize.height <= from.y;
    if (!targetIsAboveSource) return endpoints;
    return {
      from: endpoints.from,
      to: { x: toCenter.x, y: to.y + toSize.height }
    };
  }

  const targetIsBehindSource = to.x + toSize.width <= from.x;
  if (!targetIsBehindSource) return endpoints;
  return {
    from: endpoints.from,
    to: { x: to.x + toSize.width, y: toCenter.y }
  };
}

function shouldBendEdge(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  _fromSize: NodeSize,
  _toSize: NodeSize
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (direction === 'horizontal') return Math.abs(dy) > 2;
  return Math.abs(dx) > 2;
}

function edgeIntersectsNodeCorridor(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>
) {
  return edgeCorridorObstacleBoxes(from, to, direction, fromId, toId, nodeBoxes).length > 0;
}

function edgeCorridorObstacleBoxes(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>
): NodeBox[] {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const obstacles: NodeBox[] = [];

  for (const [nodeId, box] of nodeBoxes.entries()) {
    if (nodeId === fromId || nodeId === toId) continue;

    if (direction === 'horizontal') {
      const xInset = Math.min(56, dx * 0.3);
      const corridorLeft = minX + xInset;
      const corridorRight = maxX - xInset;
      if (corridorRight <= corridorLeft) continue;
      const corridorTop = minY - 14;
      const corridorBottom = maxY + 14;
      const intersectsX = box.left < corridorRight && box.right > corridorLeft;
      const intersectsY = box.top < corridorBottom && box.bottom > corridorTop;
      if (intersectsX && intersectsY) obstacles.push(box);
      continue;
    }

    const yInset = Math.min(56, dy * 0.3);
    const corridorTop = minY + yInset;
    const corridorBottom = maxY - yInset;
    if (corridorBottom <= corridorTop) continue;
    const corridorLeft = minX - 14;
    const corridorRight = maxX + 14;
    const intersectsX = box.left < corridorRight && box.right > corridorLeft;
    const intersectsY = box.top < corridorBottom && box.bottom > corridorTop;
    if (intersectsX && intersectsY) obstacles.push(box);
  }

  return obstacles;
}

function computeAutoEdgeBend(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>
): EdgeBend | undefined {
  const obstacles = edgeCorridorObstacleBoxes(from, to, direction, fromId, toId, nodeBoxes);
  const isBackEdge = direction === 'horizontal' ? to.x < from.x : to.y < from.y;
  if (!isBackEdge && obstacles.length === 0) return undefined;

  const midpoint = edgeMidpoint(from, to);
  const clearance = 48;

  if (direction === 'horizontal') {
    const top = obstacles.length > 0
      ? Math.min(...obstacles.map(box => box.top), from.y, to.y)
      : Math.min(from.y, to.y);
    const bottom = obstacles.length > 0
      ? Math.max(...obstacles.map(box => box.bottom), from.y, to.y)
      : Math.max(from.y, to.y);
    const upperY = top - clearance;
    const lowerY = bottom + clearance;
    const y = isBackEdge && obstacles.length === 0
      ? upperY
      : Math.abs(midpoint.y - upperY) <= Math.abs(midpoint.y - lowerY)
        ? upperY
        : lowerY;
    return { x: midpoint.x, y };
  }

  const left = obstacles.length > 0
    ? Math.min(...obstacles.map(box => box.left), from.x, to.x)
    : Math.min(from.x, to.x);
  const right = obstacles.length > 0
    ? Math.max(...obstacles.map(box => box.right), from.x, to.x)
    : Math.max(from.x, to.x);
  const leftX = left - clearance;
  const rightX = right + clearance;
  const x = isBackEdge && obstacles.length === 0
    ? leftX
    : Math.abs(midpoint.x - leftX) <= Math.abs(midpoint.x - rightX)
      ? leftX
      : rightX;
  return { x, y: midpoint.y };
}

function getNodeBoxesBounds(boxes: NodeBox[]): NodeBox | undefined {
  if (boxes.length === 0) return undefined;
  return {
    left: Math.min(...boxes.map(box => box.left)),
    right: Math.max(...boxes.map(box => box.right)),
    top: Math.min(...boxes.map(box => box.top)),
    bottom: Math.max(...boxes.map(box => box.bottom))
  };
}

function filterNodeBoxesByIds(nodeBoxes: Map<NodeId, NodeBox>, nodeIds: Iterable<NodeId>): Map<NodeId, NodeBox> {
  const filtered = new Map<NodeId, NodeBox>();
  for (const nodeId of nodeIds) {
    const box = nodeBoxes.get(nodeId);
    if (box) filtered.set(nodeId, box);
  }
  return filtered;
}

function routeFromPoints(points: Point[]): EdgeRoute | undefined {
  return points.length > 0 ? { points } : undefined;
}

function dedupeRouteCandidates(candidates: Point[][]): Point[][] {
  const seen = new Set<string>();
  const unique: Point[][] = [];
  for (const candidate of candidates) {
    const key = candidate.map(point => `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function chooseBestRoute(
  candidates: Point[][],
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>
): EdgeRoute | undefined {
  const [best] = dedupeRouteCandidates(candidates)
    .map(points => ({
      points,
      obstacleCount: routeObstacleCount(points, fromId, toId, nodeBoxes),
      clearancePenalty: routeClearancePenalty(points, fromId, toId, nodeBoxes),
      length: routeLength(points),
      turns: routeTurnCount(points)
    }))
    .sort((left, right) => (
      left.obstacleCount - right.obstacleCount ||
      left.clearancePenalty - right.clearancePenalty ||
      left.turns - right.turns ||
      left.length - right.length
    ));
  return best ? routeFromPoints(best.points.slice(1, -1)) : undefined;
}

function chooseBestSnappedRoute(
  candidates: Array<{ points: Point[]; laneDistance: number; pointerDistance?: number }>,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>,
  preferClearance = false
): EdgeRoute | undefined {
  const [best] = candidates
    .map(candidate => ({
      ...candidate,
      obstacleCount: routeObstacleCount(candidate.points, fromId, toId, nodeBoxes),
      clearancePenalty: Math.min(50000, routeClearancePenalty(candidate.points, fromId, toId, nodeBoxes)),
      length: routeLength(candidate.points),
      turns: routeTurnCount(candidate.points)
    }))
    .sort((left, right) => {
      const common = left.obstacleCount - right.obstacleCount;
      if (common !== 0) return common;
      if (preferClearance) {
        return (
          left.clearancePenalty - right.clearancePenalty ||
          left.laneDistance - right.laneDistance ||
          (left.pointerDistance || 0) - (right.pointerDistance || 0) ||
          left.turns - right.turns ||
          left.length - right.length
        );
      }
      return (
        left.laneDistance - right.laneDistance ||
        (left.pointerDistance || 0) - (right.pointerDistance || 0) ||
        left.clearancePenalty - right.clearancePenalty ||
        left.turns - right.turns ||
        left.length - right.length
      );
    });
  return best ? routeFromPoints(best.points.slice(1, -1)) : undefined;
}

function computeAutoEdgeRoute(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>,
  routeLane = 0,
  spacing: RouteSpacing = { primary: 48, secondary: 48 },
  anchors?: EdgeAnchors
): EdgeRoute | undefined {
  const obstacles = edgeCorridorObstacleBoxes(from, to, direction, fromId, toId, nodeBoxes);
  const isBackEdge = direction === 'horizontal' ? to.x < from.x : to.y < from.y;
  if (!isBackEdge && obstacles.length === 0) return undefined;

  const primaryClearance = getEndpointSpacingOffset(spacing.primary) || 24;
  const secondaryClearance = getEndpointSpacingOffset(spacing.secondary) || 24;
  const lanePadding = Math.min(72, Math.max(0, routeLane) * 14);
  const graphBounds = getNodeBoxesBounds([...nodeBoxes.values()]);

  if (direction === 'horizontal') {
    const sourceSign = getRouteTangentSign(anchors?.from, 'source', direction, from, to);
    const targetSign = getRouteTangentSign(anchors?.to, 'target', direction, from, to);
    if (isBackEdge && graphBounds) {
      const sourceExitX = from.x + sourceSign * primaryClearance;
      const targetEntryX = to.x + targetSign * primaryClearance;
      const sourceBox = nodeBoxes.get(fromId);
      const targetBox = nodeBoxes.get(toId);
      const sourcePreferredLanes = sourceBox
        ? [sourceBox.top - secondaryClearance - lanePadding, sourceBox.bottom + secondaryClearance + lanePadding]
        : [from.y];
      const targetPreferredLanes = targetBox
        ? [targetBox.top - secondaryClearance - lanePadding, targetBox.bottom + secondaryClearance + lanePadding]
        : [to.y];
      const laneCandidates = uniqueSortedNumbers([
        ...getDraggedRouteLaneCandidates(from, to, direction, from, nodeBoxes, spacing, false),
        ...sourcePreferredLanes,
        ...targetPreferredLanes
      ]);
      const routes = laneCandidates.map(lane => ({
        laneDistance: Math.min(
          ...sourcePreferredLanes.map(preferred => Math.abs(lane - preferred)),
          ...targetPreferredLanes.map(preferred => Math.abs(lane - preferred))
        ),
        points: [
          from,
          { x: sourceExitX, y: from.y },
          { x: sourceExitX, y: lane },
          { x: targetEntryX, y: lane },
          { x: targetEntryX, y: to.y },
          to
        ]
      }));
      return chooseBestSnappedRoute(routes, fromId, toId, nodeBoxes);
    }

    const bounds = getNodeBoxesBounds(obstacles) || graphBounds;
    if (!bounds) return routeFromBend(computeAutoEdgeBend(from, to, direction, fromId, toId, nodeBoxes));
    const topLane = bounds.top - secondaryClearance - lanePadding;
    const bottomLane = bounds.bottom + secondaryClearance + lanePadding;
    const dx = Math.max(80, Math.abs(to.x - from.x));
    const entryX = from.x + Math.min(primaryClearance, dx / 3);
    const exitX = to.x - Math.min(primaryClearance, dx / 3);
    return chooseBestRoute(
      [
        [from, { x: entryX, y: from.y }, { x: entryX, y: topLane }, { x: exitX, y: topLane }, { x: exitX, y: to.y }, to],
        [from, { x: entryX, y: from.y }, { x: entryX, y: bottomLane }, { x: exitX, y: bottomLane }, { x: exitX, y: to.y }, to]
      ],
      fromId,
      toId,
      nodeBoxes
    );
  }

  const sourceSign = getRouteTangentSign(anchors?.from, 'source', direction, from, to);
  const targetSign = getRouteTangentSign(anchors?.to, 'target', direction, from, to);
  if (isBackEdge && graphBounds) {
    const sourceExitY = from.y + sourceSign * primaryClearance;
    const targetEntryY = to.y + targetSign * primaryClearance;
    const sourceBox = nodeBoxes.get(fromId);
    const targetBox = nodeBoxes.get(toId);
    const sourcePreferredLanes = sourceBox
      ? [sourceBox.left - secondaryClearance - lanePadding, sourceBox.right + secondaryClearance + lanePadding]
      : [from.x];
    const targetPreferredLanes = targetBox
      ? [targetBox.left - secondaryClearance - lanePadding, targetBox.right + secondaryClearance + lanePadding]
      : [to.x];
    const laneCandidates = uniqueSortedNumbers([
      ...getDraggedRouteLaneCandidates(from, to, direction, from, nodeBoxes, spacing, false),
      ...sourcePreferredLanes,
      ...targetPreferredLanes
    ]);
    const routes = laneCandidates.map(lane => ({
      laneDistance: Math.min(
        ...sourcePreferredLanes.map(preferred => Math.abs(lane - preferred)),
        ...targetPreferredLanes.map(preferred => Math.abs(lane - preferred))
      ),
      points: [
        from,
        { x: from.x, y: sourceExitY },
        { x: lane, y: sourceExitY },
        { x: lane, y: targetEntryY },
        { x: to.x, y: targetEntryY },
        to
      ]
    }));
    return chooseBestSnappedRoute(routes, fromId, toId, nodeBoxes);
  }

  const bounds = getNodeBoxesBounds(obstacles) || graphBounds;
  if (!bounds) return routeFromBend(computeAutoEdgeBend(from, to, direction, fromId, toId, nodeBoxes));
  const leftLane = bounds.left - secondaryClearance - lanePadding;
  const rightLane = bounds.right + secondaryClearance + lanePadding;
  const dy = Math.max(80, Math.abs(to.y - from.y));
  const entryY = from.y + Math.min(primaryClearance, dy / 3);
  const exitY = to.y - Math.min(primaryClearance, dy / 3);
  return chooseBestRoute(
    [
      [from, { x: from.x, y: entryY }, { x: leftLane, y: entryY }, { x: leftLane, y: exitY }, { x: to.x, y: exitY }, to],
      [from, { x: from.x, y: entryY }, { x: rightLane, y: entryY }, { x: rightLane, y: exitY }, { x: to.x, y: exitY }, to]
    ],
    fromId,
    toId,
    nodeBoxes
  );
}

function edgePath(
  from: Point,
  to: Point,
  lane: number,
  direction: LayoutDirection,
  fromSize: NodeSize,
  toSize: NodeSize,
  forceBend = false,
  manualRoute?: EdgeRoute
): string {
  if (manualRoute && manualRoute.points.length > 0) {
    if (manualRoute.points.length === 1) {
      const bend = manualRoute.points[0];
      return `M ${from.x} ${from.y} Q ${bend.x} ${bend.y} ${to.x} ${to.y}`;
    }
    return roundedRoutePath([from, ...manualRoute.points, to]);
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!forceBend && !shouldBendEdge(from, to, direction, fromSize, toSize)) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  if (direction === 'horizontal') {
    const handleX = Math.max(18, Math.min(40, Math.abs(dx) * 0.16));
    const midX = from.x + dx / 2;
    const midY = from.y + dy / 2;
    if (!forceBend) {
      return `M ${from.x} ${from.y} C ${from.x + handleX} ${from.y} ${midX - handleX} ${from.y} ${midX} ${midY} C ${midX + handleX} ${to.y} ${to.x - handleX} ${to.y} ${to.x} ${to.y}`;
    }
    const bendBase = Math.min(40, 10 + Math.abs(dx) * 0.06);
    const sign = dy === 0 ? (lane % 2 === 0 ? -1 : 1) : Math.sign(dy);
    const bend = sign * (bendBase + Math.abs(lane) * 10);
    return `M ${from.x} ${from.y} C ${from.x + handleX} ${from.y} ${midX - handleX} ${midY + bend} ${midX} ${midY + bend} C ${midX + handleX} ${midY + bend} ${to.x - handleX} ${to.y} ${to.x} ${to.y}`;
  }
  const handleY = Math.max(18, Math.min(40, Math.abs(dy) * 0.16));
  const midX = from.x + dx / 2;
  const midY = from.y + dy / 2;
  if (!forceBend) {
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + handleY} ${from.x} ${midY - handleY} ${midX} ${midY} C ${to.x} ${midY + handleY} ${to.x} ${to.y - handleY} ${to.x} ${to.y}`;
  }
  const bendBase = Math.min(40, 10 + Math.abs(dy) * 0.06);
  const sign = dx === 0 ? (lane % 2 === 0 ? -1 : 1) : Math.sign(dx);
  const bend = sign * (bendBase + Math.abs(lane) * 10);
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + handleY} ${midX + bend} ${midY - handleY} ${midX + bend} ${midY} C ${midX + bend} ${midY + handleY} ${to.x} ${to.y - handleY} ${to.x} ${to.y}`;
}

function pointAlongSegment(from: Point, to: Point, distance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return to;
  const ratio = Math.min(1, distance / length);
  return {
    x: to.x - dx * ratio,
    y: to.y - dy * ratio
  };
}

function pointAfterCorner(corner: Point, to: Point, distance: number): Point {
  const dx = to.x - corner.x;
  const dy = to.y - corner.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return corner;
  const ratio = Math.min(1, distance / length);
  return {
    x: corner.x + dx * ratio,
    y: corner.y + dy * ratio
  };
}

function roundedRoutePath(points: Point[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const cornerRadius = 28;
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const prevDistance = Math.sqrt(distanceSquared(prev, corner));
    const nextDistance = Math.sqrt(distanceSquared(corner, next));
    const radius = Math.min(cornerRadius, prevDistance / 2, nextDistance / 2);

    if (radius <= 1) {
      commands.push(`L ${corner.x} ${corner.y}`);
      continue;
    }

    const beforeCorner = pointAlongSegment(prev, corner, radius);
    const afterCorner = pointAfterCorner(corner, next, radius);
    commands.push(`L ${beforeCorner.x} ${beforeCorner.y}`);
    commands.push(`Q ${corner.x} ${corner.y} ${afterCorner.x} ${afterCorner.y}`);
  }

  const last = points[points.length - 1];
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(' ');
}

function edgeMidpoint(from: Point, to: Point): EdgeBend {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

function routeControlPoint(from: Point, to: Point, route: EdgeRoute): Point {
  const points = [from, ...route.points, to];
  const totalLength = routeLength(points);
  if (totalLength <= 0) return edgeMidpoint(from, to);

  let remaining = totalLength / 2;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = Math.sqrt(distanceSquared(start, end));
    if (segmentLength === 0) continue;
    if (remaining <= segmentLength) {
      const ratio = remaining / segmentLength;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio
      };
    }
    remaining -= segmentLength;
  }

  return edgeMidpoint(from, to);
}

function routeFromBend(bend?: EdgeBend): EdgeRoute | undefined {
  return bend ? { points: [bend] } : undefined;
}

function compactRoutePoints(points: Point[]): Point[] {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > 1 || Math.abs(point.y - previous.y) > 1;
  });
}

function getRouteTangentSign(
  anchor: EdgeAnchor | undefined,
  role: 'source' | 'target',
  direction: LayoutDirection,
  from: Point,
  to: Point
): number {
  if (anchor === 'front') return -1;
  if (anchor === 'back') return 1;
  if (anchor === 'body' && role === 'target') return -1;
  if (direction === 'horizontal') return to.x >= from.x ? 1 : -1;
  return to.y >= from.y ? 1 : -1;
}

const MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET = 10;

function getDraggedRouteOffset(distance: number, neighborOffset?: number): number {
  const fallback = Math.min(72, distance / 3);
  if (typeof neighborOffset !== 'number' || !Number.isFinite(neighborOffset)) return fallback;
  return Math.min(
    Math.max(MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET, distance - MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET),
    Math.max(MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET, neighborOffset)
  );
}

function getEndpointSpacingOffset(
  spacing: number
): number | undefined {
  if (!Number.isFinite(spacing)) return undefined;
  const routeGap = Math.max(MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET * 2, spacing);
  return routeGap / 2;
}

function getRouteSpacingOffsets(spacing: RouteSpacing): { primary: number; secondary: number } {
  return {
    primary: getEndpointSpacingOffset(spacing.primary) || 24,
    secondary: getEndpointSpacingOffset(spacing.secondary) || 24
  };
}

function uniqueSortedNumbers(values: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values.sort((left, right) => left - right)) {
    const rounded = Math.round(value * 10) / 10;
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    result.push(value);
  }
  return result;
}

function getDraggedRouteLaneCandidates(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  pointer: Point,
  nodeBoxes: Map<NodeId, NodeBox>,
  spacing: RouteSpacing,
  includeEndpointLanes = true
): number[] {
  const { secondary } = getRouteSpacingOffsets(spacing);
  const bounds = getNodeBoxesBounds([...nodeBoxes.values()]);
  const candidates: number[] = [];

  if (direction === 'horizontal') {
    if (includeEndpointLanes) candidates.push(from.y, to.y);
    const boxes = [...nodeBoxes.values()].sort((left, right) => left.top - right.top || left.left - right.left);
    for (const box of boxes) {
      candidates.push(box.top - secondary, box.bottom + secondary);
    }
    for (let index = 1; index < boxes.length; index += 1) {
      const previous = boxes[index - 1];
      const current = boxes[index];
      if (current.top >= previous.bottom) {
        candidates.push(previous.bottom + (current.top - previous.bottom) / 2);
      }
    }
    if (bounds) candidates.push(bounds.top - secondary, bounds.bottom + secondary);
    if (candidates.length === 0) candidates.push(pointer.y);
    return uniqueSortedNumbers(candidates);
  }

  if (includeEndpointLanes) candidates.push(from.x, to.x);
  const boxes = [...nodeBoxes.values()].sort((left, right) => left.left - right.left || left.top - right.top);
  for (const box of boxes) {
    candidates.push(box.left - secondary, box.right + secondary);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    const current = boxes[index];
    if (current.left >= previous.right) {
      candidates.push(previous.right + (current.left - previous.right) / 2);
    }
  }
  if (bounds) candidates.push(bounds.left - secondary, bounds.right + secondary);
  if (candidates.length === 0) candidates.push(pointer.x);
  return uniqueSortedNumbers(candidates);
}

function routeFromDraggedControl(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  pointer: Point,
  anchors?: EdgeAnchors,
  endpointOffsets?: DraggedRouteEndpointOffsets
): EdgeRoute {
  if (direction === 'horizontal') {
    const distance = Math.max(48, Math.abs(to.x - from.x));
    const sourceSign = getRouteTangentSign(anchors?.from, 'source', direction, from, to);
    const targetSign = getRouteTangentSign(anchors?.to, 'target', direction, from, to);
    const sourceOffset = getDraggedRouteOffset(distance, endpointOffsets?.source);
    const targetOffset = getDraggedRouteOffset(distance, endpointOffsets?.target);
    const entryX = from.x + sourceSign * sourceOffset;
    const exitX = to.x + targetSign * targetOffset;
    return {
      points: compactRoutePoints([
        { x: entryX, y: from.y },
        { x: entryX, y: pointer.y },
        { x: exitX, y: pointer.y },
        { x: exitX, y: to.y }
      ])
    };
  }

  const distance = Math.max(48, Math.abs(to.y - from.y));
  const sourceSign = getRouteTangentSign(anchors?.from, 'source', direction, from, to);
  const targetSign = getRouteTangentSign(anchors?.to, 'target', direction, from, to);
  const sourceOffset = getDraggedRouteOffset(distance, endpointOffsets?.source);
  const targetOffset = getDraggedRouteOffset(distance, endpointOffsets?.target);
  const entryY = from.y + sourceSign * sourceOffset;
  const exitY = to.y + targetSign * targetOffset;
  return {
    points: compactRoutePoints([
      { x: from.x, y: entryY },
      { x: pointer.x, y: entryY },
      { x: pointer.x, y: exitY },
      { x: to.x, y: exitY }
    ])
  };
}

function routeFromSnappedDraggedControl(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  pointer: Point,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>,
  spacing: RouteSpacing,
  anchors?: EdgeAnchors,
  endpointOffsets?: DraggedRouteEndpointOffsets
): EdgeRoute {
  const candidates = getDraggedRouteLaneCandidates(from, to, direction, pointer, nodeBoxes, spacing, false);
  const pointerLane = direction === 'horizontal' ? pointer.y : pointer.x;
  const snappedCandidates = candidates.map(lane => {
    const snappedPointer = direction === 'horizontal'
      ? { x: pointer.x, y: lane }
      : { x: lane, y: pointer.y };
    const route = routeFromDraggedControl(from, to, direction, snappedPointer, anchors, endpointOffsets);
    const points = [from, ...route.points, to];
    return {
      route,
      laneDistance: Math.abs(lane - pointerLane),
      obstacleCount: routeObstacleCount(points, fromId, toId, nodeBoxes),
      clearancePenalty: Math.min(50000, routeClearancePenalty(points, fromId, toId, nodeBoxes)),
      turns: routeTurnCount(points),
      length: routeLength(points)
    };
  });
  const scoredRoutes = snappedCandidates.sort((left, right) => (
    left.obstacleCount - right.obstacleCount ||
    left.laneDistance - right.laneDistance ||
    left.clearancePenalty - right.clearancePenalty ||
    left.turns - right.turns ||
    left.length - right.length
  ));

  return scoredRoutes[0]?.route || routeFromDraggedControl(from, to, direction, pointer, anchors, endpointOffsets);
}

function isForwardIncomingManualEdge(
  edge: FlowEdge,
  from: Point,
  to: Point,
  direction: LayoutDirection,
  layoutEdgeIds: Set<EdgeId>
): boolean {
  if (edge.role !== 'manual' || layoutEdgeIds.has(edge.id)) return false;
  if (edge.anchors?.from === 'front' || edge.anchors?.to === 'back') return false;
  return direction === 'horizontal'
    ? to.x > from.x + 12
    : to.y > from.y + 12;
}

function routeForwardIncomingConverge(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  primaryGap: number
): EdgeRoute | undefined {
  const inset = Math.max(18, Math.min(48, primaryGap * 0.65));
  const minSegment = 10;

  if (direction === 'horizontal') {
    const directDistance = to.x - from.x;
    if (directDistance <= minSegment * 2) return undefined;
    let trunkX = to.x - inset;
    if (trunkX <= from.x + minSegment || trunkX >= to.x - minSegment) {
      trunkX = from.x + directDistance / 2;
    }
    if (trunkX <= from.x + minSegment || trunkX >= to.x - minSegment) return undefined;
    return routeFromPoints(compactRoutePoints([
      { x: trunkX, y: from.y },
      { x: trunkX, y: to.y }
    ]));
  }

  const directDistance = to.y - from.y;
  if (directDistance <= minSegment * 2) return undefined;
  let trunkY = to.y - inset;
  if (trunkY <= from.y + minSegment || trunkY >= to.y - minSegment) {
    trunkY = from.y + directDistance / 2;
  }
  if (trunkY <= from.y + minSegment || trunkY >= to.y - minSegment) return undefined;
  return routeFromPoints(compactRoutePoints([
    { x: from.x, y: trunkY },
    { x: to.x, y: trunkY }
  ]));
}

function cubicPoint(from: Point, controlA: Point, controlB: Point, to: Point, t: number): Point {
  const inverse = 1 - t;
  const inverseSquared = inverse * inverse;
  const tSquared = t * t;
  return {
    x:
      inverseSquared * inverse * from.x +
      3 * inverseSquared * t * controlA.x +
      3 * inverse * tSquared * controlB.x +
      tSquared * t * to.x,
    y:
      inverseSquared * inverse * from.y +
      3 * inverseSquared * t * controlA.y +
      3 * inverse * tSquared * controlB.y +
      tSquared * t * to.y
  };
}

function quadraticPoint(from: Point, control: Point, to: Point, t: number): Point {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y
  };
}

function samplePath(path: string): Point[] {
  const tokens = path.match(/[MLCQ]|-?\d+(?:\.\d+)?/g) || [];
  const points: Point[] = [];
  let index = 0;
  let current: Point | null = null;

  const readNumber = () => {
    const value = Number(tokens[index]);
    index += 1;
    return value;
  };

  const readPoint = (): Point => ({ x: readNumber(), y: readNumber() });

  while (index < tokens.length) {
    const command = tokens[index];
    index += 1;
    if (command === 'M') {
      current = readPoint();
      points.push(current);
      continue;
    }
    if (!current) break;
    if (command === 'L') {
      current = readPoint();
      points.push(current);
      continue;
    }
    if (command === 'Q') {
      const control = readPoint();
      const to = readPoint();
      for (let step = 1; step <= 18; step += 1) {
        points.push(quadraticPoint(current, control, to, step / 18));
      }
      current = to;
      continue;
    }
    if (command === 'C') {
      const controlA = readPoint();
      const controlB = readPoint();
      const to = readPoint();
      for (let step = 1; step <= 24; step += 1) {
        points.push(cubicPoint(current, controlA, controlB, to, step / 24));
      }
      current = to;
    }
  }

  return points;
}

function distanceToPathSquared(point: Point, path: string): number {
  const points = samplePath(path);
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return distanceSquared(point, points[0]);

  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    nearest = Math.min(nearest, distanceToSegmentSquared(point, points[index], points[index + 1]));
  }
  return nearest;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampSidePanelWidth(width: number): number {
  const viewportMax =
    typeof window === 'undefined' ? SIDE_PANEL_MAX_WIDTH : Math.max(SIDE_PANEL_MIN_WIDTH, window.innerWidth - 520);
  return clamp(width, SIDE_PANEL_MIN_WIDTH, Math.min(SIDE_PANEL_MAX_WIDTH, viewportMax));
}

function boxesOverlap(a: NodeBox, b: NodeBox, gap = 0): boolean {
  return !(
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  );
}

function clampNodeLabel(label: string): string {
  return label.slice(0, NODE_TEXT_MAX_LEN);
}

function nextCustomTagId(tags: FlowTag[]): string {
  let index = tags.length + 1;
  const ids = new Set(tags.map(tag => tag.id));
  while (ids.has(`tag-custom-${index}`)) index++;
  return `tag-custom-${index}`;
}

function edgeSeq(edgeId: string): number {
  if (!edgeId.startsWith('e')) return Number.MAX_SAFE_INTEGER;
  const value = Number(edgeId.slice(1));
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function edgeOrder(edge: FlowEdge): number {
  return typeof edge.order === 'number' && Number.isFinite(edge.order) ? edge.order : edgeSeq(edge.id);
}

function compareEdgeOrder(a: FlowEdge, b: FlowEdge): number {
  return edgeOrder(a) - edgeOrder(b) || edgeSeq(a.id) - edgeSeq(b.id) || a.id.localeCompare(b.id);
}

function isLayoutEdge(edge: FlowEdge): boolean {
  return edge.role !== 'manual';
}

function analyzeLayoutEdges(doc: FlowDoc): LayoutEdgeAnalysis {
  const nodeIds = new Set(doc.nodes.map(node => node.id));
  const incomingCount = new Map<NodeId, number>();
  const outgoing = new Map<NodeId, FlowEdge[]>();
  for (const node of doc.nodes) {
    incomingCount.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of doc.edges) {
    if (!isLayoutEdge(edge)) continue;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge);
  }
  for (const edges of outgoing.values()) {
    edges.sort(compareEdgeOrder);
  }

  const rootIds = doc.nodes
    .map(node => node.id)
    .filter(id => (incomingCount.get(id) || 0) === 0);
  const traversalRoots = [...rootIds];
  const firstNodeId = doc.nodes[0]?.id;
  if (firstNodeId && !traversalRoots.includes(firstNodeId)) traversalRoots.unshift(firstNodeId);

  const depthByNode = new Map<NodeId, number>();
  const queue: NodeId[] = [];
  for (const rootId of traversalRoots) {
    if (depthByNode.has(rootId)) continue;
    depthByNode.set(rootId, 0);
    queue.push(rootId);
  }

  const layoutEdgeIds = new Set<string>();
  while (queue.length > 0) {
    const from = queue.shift()!;
    const fromDepth = depthByNode.get(from) || 0;
    for (const edge of outgoing.get(from) || []) {
      const existingToDepth = depthByNode.get(edge.to);
      if (typeof existingToDepth !== 'number') {
        depthByNode.set(edge.to, fromDepth + 1);
        layoutEdgeIds.add(edge.id);
        queue.push(edge.to);
        continue;
      }
      if (fromDepth < existingToDepth) {
        layoutEdgeIds.add(edge.id);
      }
    }
  }

  const layoutEdges = doc.edges.filter(edge => layoutEdgeIds.has(edge.id));
  const layoutIncoming = new Map<NodeId, number>();
  for (const node of doc.nodes) layoutIncoming.set(node.id, 0);
  for (const edge of layoutEdges) {
    layoutIncoming.set(edge.to, (layoutIncoming.get(edge.to) || 0) + 1);
  }

  return {
    layoutEdges,
    layoutEdgeIds,
    rootNodeIds: new Set(doc.nodes.map(node => node.id).filter(id => (layoutIncoming.get(id) || 0) === 0))
  };
}

function sameValues<T>(values: T[]): T | '' {
  if (values.length === 0) return '';
  const first = values[0];
  return values.every(value => value === first) ? first : '';
}

function hasMixedValues<T>(values: T[]): boolean {
  return values.length > 1 && values.some(value => value !== values[0]);
}

function effectiveEdgeStyle(edge: FlowEdge, defaultStyle: EdgeStyle): Required<EdgeStyle> {
  return {
    width: edge.style?.width || defaultStyle.width || 2,
    lineType: edge.style?.lineType || defaultStyle.lineType || 'solid',
    color: edge.style?.color || defaultStyle.color || '#64748b'
  };
}

function edgeStrokeDasharray(lineType: EdgeLineType, width: number): string | undefined {
  if (lineType === 'dashed') return `${width * 4} ${width * 3}`;
  if (lineType === 'dotted') return `1 ${width * 3}`;
  return undefined;
}

function collectConnectedComponent(doc: FlowDoc, startNodeId: NodeId): NodeId[] {
  const neighbors = new Map<NodeId, Set<NodeId>>();
  for (const node of doc.nodes) {
    neighbors.set(node.id, new Set());
  }
  for (const edge of doc.edges) {
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  }
  const queue: NodeId[] = [startNodeId];
  const visited = new Set<NodeId>([startNodeId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbors.get(current) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return [...visited];
}

function collectEdgeComponent(doc: FlowDoc, startNodeId: NodeId, edgeIds: Set<string>): NodeId[] {
  const neighbors = new Map<NodeId, Set<NodeId>>();
  for (const node of doc.nodes) {
    neighbors.set(node.id, new Set());
  }
  for (const edge of doc.edges) {
    if (!edgeIds.has(edge.id)) continue;
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  }
  const queue: NodeId[] = [startNodeId];
  const visited = new Set<NodeId>([startNodeId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbors.get(current) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return [...visited];
}

function getNodeIdFromEventTarget(target: EventTarget | null | undefined): NodeId | null {
  if (!target || !(target instanceof Element)) return null;
  const nodeEl = target.closest('[data-testid^="node-"]') as HTMLElement | null;
  if (!nodeEl) return null;
  const testId = nodeEl.dataset.testid || nodeEl.getAttribute('data-testid');
  if (!testId || !testId.startsWith('node-')) return null;
  const nodeId = testId.slice(5);
  return nodeId.length > 0 ? nodeId : null;
}

function getPrimaryParentId(doc: FlowDoc, nodeId: NodeId): NodeId | null {
  return getPrimaryParentEdge(doc, nodeId)?.from || null;
}

function getPrimaryParentEdge(doc: FlowDoc, nodeId: NodeId): FlowEdge | null {
  const incoming = doc.edges.filter(edge => edge.to === nodeId && isLayoutEdge(edge)).sort(compareEdgeOrder);
  return incoming[0] || null;
}

function getOrderedLayoutChildEdges(doc: FlowDoc, parentId: NodeId): FlowEdge[] {
  const primaryByChild = new Map<NodeId, FlowEdge>();
  for (const edge of doc.edges.filter(edge => edge.from === parentId && isLayoutEdge(edge)).sort(compareEdgeOrder)) {
    const primaryEdge = getPrimaryParentEdge(doc, edge.to);
    if (primaryEdge?.id === edge.id) primaryByChild.set(edge.to, edge);
  }
  return [...primaryByChild.values()].sort(compareEdgeOrder);
}

function getNodeIdFromViewportPoint(clientX: number, clientY: number): NodeId | null {
  const el = document.elementFromPoint(clientX, clientY);
  return getNodeIdFromEventTarget(el);
}

function isNodeLabelInputTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.node-label-input'));
}

type ConnectHandleHit = { nodeId: NodeId; anchor: EdgeAnchor };

function resolveDraggedEdgeAnchors(sourceAnchors: EdgeAnchors, targetAnchor?: EdgeAnchor): EdgeAnchors | null {
  const sourceAnchor = sourceAnchors.from === 'front' ? 'front' : 'back';
  const resolvedTargetAnchor =
    targetAnchor && targetAnchor !== 'body' && targetAnchor !== 'auto'
      ? targetAnchor
      : oppositeNodeSideAnchor(sourceAnchor);
  if (sourceAnchor === resolvedTargetAnchor) return null;
  return { ...sourceAnchors, to: resolvedTargetAnchor };
}

function getViewportConnectHandleHit(
  clientX: number,
  clientY: number,
  nodeId: NodeId,
  direction: LayoutDirection
): ConnectHandleHit | null {
  const nodeEl = document.querySelector(`[data-testid="node-${nodeId}"]`);
  if (!(nodeEl instanceof HTMLElement)) return null;
  const rect = nodeEl.getBoundingClientRect();
  if (direction === 'horizontal') {
    const withinY = clientY >= rect.top - 8 && clientY <= rect.bottom + 8;
    if (Math.abs(clientX - rect.right) <= 14 && withinY) return { nodeId, anchor: 'back' };
    if (Math.abs(clientX - rect.left) <= 14 && withinY) return { nodeId, anchor: 'front' };
    return null;
  }
  const withinX = clientX >= rect.left - 8 && clientX <= rect.right + 8;
  if (Math.abs(clientY - rect.bottom) <= 14 && withinX) return { nodeId, anchor: 'back' };
  if (Math.abs(clientY - rect.top) <= 14 && withinX) return { nodeId, anchor: 'front' };
  return null;
}

function isViewportPointOnConnectHandle(clientX: number, clientY: number, nodeId: NodeId, direction: LayoutDirection) {
  return Boolean(getViewportConnectHandleHit(clientX, clientY, nodeId, direction));
}

function getConnectHandleHitFromViewportPoint(clientX: number, clientY: number, direction: LayoutDirection): ConnectHandleHit | null {
  const nodeEls = Array.from(document.querySelectorAll('[data-testid^="node-"]'));
  for (const nodeEl of nodeEls) {
    if (!(nodeEl instanceof HTMLElement)) continue;
    const testId = nodeEl.dataset.testid || nodeEl.getAttribute('data-testid');
    const nodeId = testId?.replace(/^node-/, '') as NodeId | undefined;
    if (!nodeId) continue;
    const hit = getViewportConnectHandleHit(clientX, clientY, nodeId, direction);
    if (hit) {
      return hit;
    }
  }
  return null;
}

export function App() {
  const [tabs, setTabs] = React.useState<TabDocument[]>([createTabDocument('tab-1', 'Untitled 1')]);
  const [activeTabId, setActiveTabId] = React.useState('tab-1');
  const [tabCounter, setTabCounter] = React.useState(2);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState('');
  const [selectedRouteControl, setSelectedRouteControl] = React.useState<EdgeRouteControlSelection | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<NodeId[]>([]);
  const selectedNodeIdsRef = React.useRef<NodeId[]>([]);
  const [copiedSelection, setCopiedSelection] = React.useState<CopiedSelection | null>(null);
  const [editingNodeId, setEditingNodeId] = React.useState<NodeId | null>(null);
  const [editingLabel, setEditingLabel] = React.useState('');
  const editingNodeIdRef = React.useRef<NodeId | null>(null);
  const editingLabelRef = React.useRef('');
  const [dragState, setDragState] = React.useState<DragState | null>(null);
  const [marquee, setMarquee] = React.useState<MarqueeState | null>(null);
  const [edgeBendDrag, setEdgeBendDrag] = React.useState<EdgeBendDragState | null>(null);
  const edgeBendDragStartSnapshotRef = React.useRef<EdgeUiSnapshot | null>(null);
  const [connectDrag, setConnectDrag] = React.useState<ConnectDragState | null>(null);
  const connectDragRef = React.useRef<ConnectDragState | null>(null);
  const [dropParentTargetId, setDropParentTargetId] = React.useState<NodeId | null>(null);
  const [fileMessage, setFileMessage] = React.useState('Ready');
  const [canvasZoom, setCanvasZoom] = React.useState(1);
  const [newTagColor, setNewTagColor] = React.useState(COLOR_SWATCHES[0]);
  const [outlineVisible, setOutlineVisible] = React.useState(true);
  const [taskTableVisible, setTaskTableVisible] = React.useState(false);
  const [taskTableExpanded, setTaskTableExpanded] = React.useState(false);
  const [taskTableSort, setTaskTableSort] = React.useState<TaskTableSort | undefined>();
  const [sidePanelWidth, setSidePanelWidth] = React.useState(SIDE_PANEL_DEFAULT_WIDTH);
  const [sidePanelResizing, setSidePanelResizing] = React.useState(false);
  const [collapsedOutlineNodeIds, setCollapsedOutlineNodeIds] = React.useState<Set<NodeId>>(() => new Set());
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const canvasSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const sidePanelResizeRef = React.useRef<SidePanelResizeState | null>(null);
  const dragDidMoveRef = React.useRef(false);
  const suppressNextEdgeClickRef = React.useRef(false);
  const pendingRightConnectFromRef = React.useRef<NodeId | null>(null);
  const pendingRightConnectAnchorsRef = React.useRef<EdgeAnchors>(HANDLE_CONNECT_ANCHORS);
  const connectDragListenersRef = React.useRef<{
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onMouseMove: (event: MouseEvent) => void;
    onMouseUp: (event: MouseEvent) => void;
  } | null>(null);
  const edgeSegmentDragListenersRef = React.useRef<{
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
  } | null>(null);

  const onSidePanelResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      sidePanelResizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: sidePanelWidth
      };
      setSidePanelResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }
      event.preventDefault();
    },
    [sidePanelWidth]
  );

  const finishSidePanelResize = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = sidePanelResizeRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;

    sidePanelResizeRef.current = null;
    setSidePanelResizing(false);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onSidePanelResizePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = sidePanelResizeRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    setSidePanelWidth(clampSidePanelWidth(resizeState.startWidth + event.clientX - resizeState.startX));
  }, []);

  const onSidePanelResizeKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -16 : 16;
    setSidePanelWidth(width => clampSidePanelWidth(width + delta));
  }, []);

  React.useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, []);

  const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0];
  const doc = activeTab.history.present;
  const isLiveCanvasInteraction = Boolean(dragState || marquee || edgeBendDrag || connectDrag);
  const layoutDirection = activeTab.layoutDirection;
  const nodeOffsets = activeTab.nodeOffsetsByDirection[layoutDirection];
  const edgeBends = activeTab.edgeBendsByDirection[layoutDirection];
  const edgeRoutes = activeTab.edgeRoutesByDirection[layoutDirection];
  selectedNodeIdsRef.current = selectedNodeIds;
  const activeTheme = getTheme(doc.settings.themeId);
  const layoutEdgeAnalysis = React.useMemo(() => analyzeLayoutEdges(doc), [doc]);
  const layoutDoc = React.useMemo(
    () => ({ ...doc, edges: layoutEdgeAnalysis.layoutEdges }),
    [doc, layoutEdgeAnalysis.layoutEdges]
  );
  const outlineTree = React.useMemo(() => buildOutlineTree(doc), [doc]);
  const rootNodeIds = layoutEdgeAnalysis.rootNodeIds;
  const primaryRootNodeId = React.useMemo(
    () => doc.nodes.find(node => rootNodeIds.has(node.id))?.id || '',
    [doc.nodes, rootNodeIds]
  );
  const selectedNodes = React.useMemo(
    () => doc.nodes.filter(node => selectedNodeIds.includes(node.id)),
    [doc.nodes, selectedNodeIds]
  );
  const nodeById = React.useMemo(() => new Map(doc.nodes.map(node => [node.id, node])), [doc.nodes]);
  const selectedNodeIdSet = React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const checkedNodeIdSet = React.useMemo(
    () => new Set(doc.checklist.checkedNodeIds),
    [doc.checklist.checkedNodeIds]
  );
  const tagById = React.useMemo(() => new Map(doc.settings.tags.map(tag => [tag.id, tag])), [doc.settings.tags]);
  const outlineChecklistTargetsByNodeId = React.useMemo(
    () => buildOutlineChecklistTargetsByNodeId(outlineTree, new Set(tagById.keys())),
    [outlineTree, tagById]
  );
  const isChecklistNodeChecked = React.useCallback(
    (nodeId: NodeId) => checkedNodeIdSet.has(nodeId),
    [checkedNodeIdSet]
  );
  const taskTableRows = React.useMemo(
    () => buildTaskTableRows(outlineTree, tagById, taskTableSort),
    [outlineTree, tagById, taskTableSort]
  );
  const selectedStyleEdges = React.useMemo(() => {
    if (selectedEdgeId) return doc.edges.filter(edge => edge.id === selectedEdgeId);
    if (selectedNodeIds.length === 0) return [];
    const selected = new Set(selectedNodeIds);
    return doc.edges.filter(edge => selected.has(edge.from) || selected.has(edge.to));
  }, [doc.edges, selectedEdgeId, selectedNodeIds]);

  const updateActiveTab = React.useCallback((recipe: (tab: TabDocument) => TabDocument) => {
    setTabs(prev => prev.map(tab => (tab.id === activeTabId ? recipe(tab) : tab)));
  }, [activeTabId]);

  const stopConnectDragListeners = React.useCallback(() => {
    const handlers = connectDragListenersRef.current;
    if (!handlers) return;
    window.removeEventListener('pointermove', handlers.onPointerMove);
    window.removeEventListener('pointerup', handlers.onPointerUp);
    window.removeEventListener('mousemove', handlers.onMouseMove);
    window.removeEventListener('mouseup', handlers.onMouseUp);
    connectDragListenersRef.current = null;
  }, []);

  const stopEdgeSegmentDragListeners = React.useCallback(() => {
    const handlers = edgeSegmentDragListenersRef.current;
    if (!handlers) return;
    window.removeEventListener('pointermove', handlers.onPointerMove);
    window.removeEventListener('pointerup', handlers.onPointerUp);
    edgeSegmentDragListenersRef.current = null;
  }, []);

  const resetTransientUiState = React.useCallback((defaultNodeId?: NodeId) => {
    stopConnectDragListeners();
    stopEdgeSegmentDragListeners();
    setSelectedEdgeId('');
    setSelectedRouteControl(null);
    setSelectedNodeIds(defaultNodeId ? [defaultNodeId] : []);
    setCopiedSelection(null);
    setEditingNodeId(null);
    setEditingLabel('');
    editingNodeIdRef.current = null;
    editingLabelRef.current = '';
    setMarquee(null);
    setDragState(null);
    setEdgeBendDrag(null);
    connectDragRef.current = null;
    setConnectDrag(null);
    setDropParentTargetId(null);
  }, [stopConnectDragListeners, stopEdgeSegmentDragListeners]);

  const setCurrentNodeOffsets = React.useCallback((updater: (prev: NodeOffsetMap) => NodeOffsetMap) => {
    updateActiveTab(tab => ({
      ...tab,
      nodeOffsetsByDirection: {
        ...tab.nodeOffsetsByDirection,
        [tab.layoutDirection]: updater(tab.nodeOffsetsByDirection[tab.layoutDirection])
      }
    }));
  }, [updateActiveTab]);

  const restoreCurrentNodeOffsets = React.useCallback((offsets: Record<NodeId, NodeOffset>) => {
    setCurrentNodeOffsets(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [nodeId, offset] of Object.entries(offsets)) {
        const current = getNodeOffset(prev, nodeId);
        if (offset.dx === 0 && offset.dy === 0) {
          if (nodeId in next) {
            delete next[nodeId];
            changed = true;
          }
        } else if (current.dx !== offset.dx || current.dy !== offset.dy) {
          next[nodeId] = offset;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [setCurrentNodeOffsets]);

  const setCurrentEdgeBends = React.useCallback((updater: (prev: EdgeBendMap) => EdgeBendMap) => {
    updateActiveTab(tab => ({
      ...tab,
      edgeBendsByDirection: {
        ...tab.edgeBendsByDirection,
        [tab.layoutDirection]: updater(tab.edgeBendsByDirection[tab.layoutDirection])
      }
    }));
  }, [updateActiveTab]);

  const setCurrentEdgeRoutes = React.useCallback((updater: (prev: EdgeRouteMap) => EdgeRouteMap) => {
    updateActiveTab(tab => ({
      ...tab,
      edgeRoutesByDirection: {
        ...tab.edgeRoutesByDirection,
        [tab.layoutDirection]: updater(tab.edgeRoutesByDirection[tab.layoutDirection])
      }
    }));
  }, [updateActiveTab]);

  const commitEdgeUiChange = React.useCallback(
    (recipe: (snapshot: EdgeUiSnapshot, layoutDirection: LayoutDirection) => EdgeUiSnapshot) => {
      updateActiveTab(tab => {
        const before = getEdgeUiSnapshot(tab);
        const after = recipe(before, tab.layoutDirection);
        if (edgeUiSnapshotsEqual(before, after)) return tab;
        return {
          ...applyEdgeUiSnapshot(tab, after),
          isDirty: true,
          interactionHistory: {
            past: pushInteractionPast(tab.interactionHistory.past, { kind: 'edge-ui', snapshot: before }),
            future: []
          }
        };
      });
      setFileMessage('Edited');
    },
    [updateActiveTab]
  );

  const commitCurrentEdgeUiSnapshot = React.useCallback(
    (before: EdgeUiSnapshot | null) => {
      if (!before) return;
      updateActiveTab(tab => {
        const after = getEdgeUiSnapshot(tab);
        if (edgeUiSnapshotsEqual(before, after)) return tab;
        return {
          ...tab,
          isDirty: true,
          interactionHistory: {
            past: pushInteractionPast(tab.interactionHistory.past, { kind: 'edge-ui', snapshot: before }),
            future: []
          }
        };
      });
      setFileMessage('Edited');
    },
    [updateActiveTab]
  );

  const undoInteraction = React.useCallback(() => {
    updateActiveTab(tab => {
      const entry = tab.interactionHistory.past[tab.interactionHistory.past.length - 1];
      if (!entry) {
        const nextHistory = undoHistory(tab.history);
        return nextHistory === tab.history ? tab : { ...tab, history: nextHistory, isDirty: true };
      }
      const base = {
        ...tab,
        isDirty: true,
        interactionHistory: {
          past: tab.interactionHistory.past.slice(0, -1),
          future: [
            entry.kind === 'edge-ui'
              ? { kind: 'edge-ui' as const, snapshot: getEdgeUiSnapshot(tab) }
              : { kind: 'doc' as const },
            ...tab.interactionHistory.future
          ]
        }
      };
      return entry.kind === 'edge-ui'
        ? applyEdgeUiSnapshot(base, entry.snapshot)
        : { ...base, history: undoHistory(tab.history) };
    });
    setFileMessage('Edited');
  }, [updateActiveTab]);

  const redoInteraction = React.useCallback(() => {
    updateActiveTab(tab => {
      const entry = tab.interactionHistory.future[0];
      if (!entry) {
        const nextHistory = redoHistory(tab.history);
        return nextHistory === tab.history ? tab : { ...tab, history: nextHistory, isDirty: true };
      }
      const base = {
        ...tab,
        isDirty: true,
        interactionHistory: {
          past: pushInteractionPast(
            tab.interactionHistory.past,
            entry.kind === 'edge-ui'
              ? { kind: 'edge-ui' as const, snapshot: getEdgeUiSnapshot(tab) }
              : { kind: 'doc' as const }
          ),
          future: tab.interactionHistory.future.slice(1)
        }
      };
      return entry.kind === 'edge-ui'
        ? applyEdgeUiSnapshot(base, entry.snapshot)
        : { ...base, history: redoHistory(tab.history) };
    });
    setFileMessage('Edited');
  }, [updateActiveTab]);

  const autoPanCanvas = React.useCallback((event: DragPointerLikeEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const threshold = 44;
    const maxStep = 24;
    let deltaX = 0;
    let deltaY = 0;
    if (event.clientX < rect.left + threshold) {
      deltaX = -Math.min(maxStep, rect.left + threshold - event.clientX);
    } else if (event.clientX > rect.right - threshold) {
      deltaX = Math.min(maxStep, event.clientX - (rect.right - threshold));
    }
    if (event.clientY < rect.top + threshold) {
      deltaY = -Math.min(maxStep, rect.top + threshold - event.clientY);
    } else if (event.clientY > rect.bottom - threshold) {
      deltaY = Math.min(maxStep, event.clientY - (rect.bottom - threshold));
    }
    if (deltaX === 0 && deltaY === 0) return;
    const maxScrollLeft = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
    const maxScrollTop = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
    canvas.scrollLeft = clamp(canvas.scrollLeft + deltaX, 0, maxScrollLeft);
    canvas.scrollTop = clamp(canvas.scrollTop + deltaY, 0, maxScrollTop);
  }, []);

  const getCanvasContentPoint = React.useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const surface = canvasSurfaceRef.current;
      const rect = surface?.getBoundingClientRect() || canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / canvasZoom,
        y: (clientY - rect.top) / canvasZoom
      };
    },
    [canvasZoom]
  );

  const getSvgContentPoint = React.useCallback((svg: SVGSVGElement | null, clientX: number, clientY: number): Point | null => {
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }, []);

  const commitDoc = React.useCallback((recipe: (current: FlowDoc) => FlowDoc) => {
    updateActiveTab(tab => {
      const nextDoc = ensureDocHasNode(recipe(tab.history.present));
      const nextHistory = commitHistory(tab.history, nextDoc);
      return {
        ...tab,
        history: nextHistory,
        interactionHistory:
          nextHistory === tab.history
            ? tab.interactionHistory
            : {
                past: pushInteractionPast(tab.interactionHistory.past, { kind: 'doc' }),
                future: []
              },
        isDirty: true
      };
    });
    setFileMessage('Edited');
  }, [updateActiveTab]);

  const toggleChecklistNodes = React.useCallback(
    (nodeIds: NodeId[], checked: boolean) => {
      if (nodeIds.length === 0) return;
      commitDoc(prev => nodeIds.reduce((nextDoc, nodeId) => setNodeChecked(nextDoc, nodeId, checked), prev));
    },
    [commitDoc]
  );

  const newTab = React.useCallback(() => {
    const id = `tab-${tabCounter}`;
    const title = `Untitled ${tabCounter}`;
    setTabs(prev => [...prev, createTabDocument(id, title)]);
    setActiveTabId(id);
    setTabCounter(prev => prev + 1);
    setFileMessage('New tab');
    resetTransientUiState('n1');
  }, [resetTransientUiState, tabCounter]);

  const closeTab = React.useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length === 1) return prev;
      const index = prev.findIndex(tab => tab.id === tabId);
      const next = prev.filter(tab => tab.id !== tabId);
      if (tabId === activeTabId) {
        const fallback = next[Math.max(0, index - 1)] || next[0];
        setActiveTabId(fallback.id);
      }
      return next;
    });
    setFileMessage('Tab closed');
    resetTransientUiState();
  }, [activeTabId, resetTransientUiState]);

  const switchTab = React.useCallback((tabId: string) => {
    setActiveTabId(tabId);
    const tab = tabs.find(item => item.id === tabId);
    const firstNodeId = tab?.history.present.nodes[0]?.id;
    resetTransientUiState(firstNodeId);
  }, [resetTransientUiState, tabs]);

  const createNewDocument = React.useCallback(() => {
    const nextDoc = createSeedDoc();
    updateActiveTab(tab => ({
      ...tab,
      history: createHistory(nextDoc),
      currentFilePath: null,
      isDirty: false,
      title: tab.title.startsWith('Untitled') ? tab.title : `Untitled ${tabCounter}`,
      nodeOffsetsByDirection: emptyOffsetsByDirection(),
      edgeBendsByDirection: emptyEdgeBendsByDirection(),
      edgeRoutesByDirection: emptyEdgeRoutesByDirection(),
      toolbarVisible: true,
      interactionHistory: emptyInteractionHistory()
    }));
    setFileMessage('New document');
    resetTransientUiState(nextDoc.nodes[0]?.id);
  }, [resetTransientUiState, tabCounter, updateActiveTab]);

  const openDocument = React.useCallback(async () => {
    try {
      const result = await window.flowmaptool.openDocument();
      if (!result) return;
      const loaded = parsePersistedQflow(result.content, {
        emptyRootLabel: ROOT_LABEL,
        emptyRootStyle: ROOT_NODE_STYLE
      });
      const id = `tab-${tabCounter}`;
      setTabs(prev => [
        ...prev,
        {
          ...createTabDocument(id, basename(result.filePath), loaded.doc),
          currentFilePath: result.filePath,
          layoutDirection: loaded.ui.layoutDirection,
          nodeOffsetsByDirection: loaded.ui.nodeOffsetsByDirection,
          edgeBendsByDirection: loaded.ui.edgeBendsByDirection,
          edgeRoutesByDirection: loaded.ui.edgeRoutesByDirection,
          toolbarVisible: loaded.ui.toolbarVisible
        }
      ]);
      setActiveTabId(id);
      setTabCounter(prev => prev + 1);
      setFileMessage(`Opened: ${result.filePath}`);
      resetTransientUiState(loaded.doc.nodes[0]?.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open file';
      setFileMessage(`Open failed: ${message}`);
    }
  }, [resetTransientUiState, tabCounter]);

  const saveDocument = React.useCallback(
    async (saveAs: boolean) => {
      try {
        const result = await window.flowmaptool.saveDocument({
          filePath: activeTab.currentFilePath,
          content: serializePersistedQflow({
            doc: activeTab.history.present,
            layoutDirection: activeTab.layoutDirection,
            nodeOffsetsByDirection: activeTab.nodeOffsetsByDirection,
            edgeBendsByDirection: activeTab.edgeBendsByDirection,
            edgeRoutesByDirection: activeTab.edgeRoutesByDirection,
            toolbarVisible: activeTab.toolbarVisible
          }),
          saveAs
        });
        if (!result) return;
        updateActiveTab(tab => ({
          ...tab,
          currentFilePath: result.filePath,
          title: basename(result.filePath),
          isDirty: false
        }));
        setFileMessage(`Saved: ${result.filePath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save file';
        setFileMessage(`Save failed: ${message}`);
      }
    },
    [activeTab, updateActiveTab]
  );

  const nodeSizeMap = React.useMemo<NodeSizeMap>(() => {
    const sizes: NodeSizeMap = {};
    for (const node of doc.nodes) {
      const effectiveLabel = editingNodeId === node.id ? editingLabel : node.label;
      sizes[node.id] = estimateNodeSize(effectiveLabel, node.style);
    }
    return sizes;
  }, [doc.nodes, editingLabel, editingNodeId]);

  const layoutSpacing = React.useMemo(
    () =>
      layoutDirection === 'horizontal'
        ? {
            primary: doc.settings.spacing.horizontal,
            secondary: doc.settings.spacing.vertical
          }
        : {
            primary: doc.settings.spacing.vertical,
            secondary: doc.settings.spacing.horizontal
          },
    [doc.settings.spacing.horizontal, doc.settings.spacing.vertical, layoutDirection]
  );

  const layout = React.useMemo(
    () => layoutFlow(layoutDoc, layoutDirection, nodeSizeMap, layoutSpacing),
    [layoutDoc, layoutDirection, layoutSpacing, nodeSizeMap]
  );
  const renderedPositionMap = React.useMemo(() => {
    const map = new Map<NodeId, LayoutPoint>();
    for (const pos of layout.positions) {
      const withOffset = applyNodeOffset(pos, getNodeOffset(nodeOffsets, pos.id));
      map.set(pos.id, { x: withOffset.x, y: withOffset.y });
    }
    return map;
  }, [layout.positions, nodeOffsets]);

  const scrollNodeIntoCanvas = React.useCallback(
    (nodeId: NodeId) => {
      const canvas = canvasRef.current;
      const rendered = renderedPositionMap.get(nodeId);
      if (!canvas || !rendered) return;
      const size = nodeSizeMap[nodeId] || DEFAULT_NODE_SIZE;
      canvas.scrollTo({
        left: Math.max(0, (rendered.x + size.width / 2) * canvasZoom - canvas.clientWidth / 2),
        top: Math.max(0, (rendered.y + size.height / 2) * canvasZoom - canvas.clientHeight / 2),
        behavior: 'auto'
      });
    },
    [canvasZoom, nodeSizeMap, renderedPositionMap]
  );

  const nodeBoxMap = React.useMemo(() => {
    const map = new Map<NodeId, NodeBox>();
    for (const node of doc.nodes) {
      const pos = renderedPositionMap.get(node.id);
      const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
      if (!pos) continue;
      map.set(node.id, {
        left: pos.x,
        right: pos.x + size.width,
        top: pos.y,
        bottom: pos.y + size.height
      });
    }
    return map;
  }, [doc.nodes, nodeSizeMap, renderedPositionMap]);

  const routeScopeNodeIdsByNodeId = React.useMemo(() => {
    const map = new Map<NodeId, NodeId[]>();
    for (const node of doc.nodes) {
      if (map.has(node.id)) continue;
      const componentNodeIds = collectEdgeComponent(doc, node.id, layoutEdgeAnalysis.layoutEdgeIds);
      for (const componentNodeId of componentNodeIds) {
        map.set(componentNodeId, componentNodeIds);
      }
    }
    return map;
  }, [doc, layoutEdgeAnalysis.layoutEdgeIds]);

  const getRouteNodeBoxes = React.useCallback(
    (edge: FlowEdge) => {
      const componentNodeIds = new Set<NodeId>();
      for (const nodeId of routeScopeNodeIdsByNodeId.get(edge.from) || [edge.from]) {
        componentNodeIds.add(nodeId);
      }
      for (const nodeId of routeScopeNodeIdsByNodeId.get(edge.to) || [edge.to]) {
        componentNodeIds.add(nodeId);
      }
      const scopedNodeBoxes = filterNodeBoxesByIds(nodeBoxMap, [...componentNodeIds]);
      return scopedNodeBoxes.size > 0 ? scopedNodeBoxes : nodeBoxMap;
    },
    [nodeBoxMap, routeScopeNodeIdsByNodeId]
  );

  const getRenderedEdgeEndpoints = React.useCallback(
    (edge: FlowEdge, fromPos: LayoutPoint, toPos: LayoutPoint, fromSize: NodeSize, toSize: NodeSize) =>
      getEdgeRenderEndpoints(
        edge,
        fromPos,
        toPos,
        layoutDirection,
        fromSize,
        toSize,
        layoutEdgeAnalysis.layoutEdgeIds.has(edge.id),
        rootNodeIds.has(edge.to)
      ),
    [layoutDirection, layoutEdgeAnalysis.layoutEdgeIds, rootNodeIds]
  );

  const useAdvancedAutoRouting =
    doc.nodes.length <= ADVANCED_ROUTE_NODE_LIMIT && doc.edges.length <= ADVANCED_ROUTE_EDGE_LIMIT;

  const edgeForceBendMap = React.useMemo(() => {
    const map = new Map<string, boolean>();
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      if (!useAdvancedAutoRouting && edge.role !== 'manual') {
        map.set(edge.id, !layoutEdgeAnalysis.layoutEdgeIds.has(edge.id));
        continue;
      }
      const routeNodeBoxes = getRouteNodeBoxes(edge);
      map.set(
        edge.id,
        !layoutEdgeAnalysis.layoutEdgeIds.has(edge.id) ||
          edgeIntersectsNodeCorridor(endpoints.from, endpoints.to, layoutDirection, edge.from, edge.to, routeNodeBoxes)
      );
    }
    return map;
  }, [
    doc.edges,
    getRenderedEdgeEndpoints,
    getRouteNodeBoxes,
    layoutSpacing,
    layoutDirection,
    layoutEdgeAnalysis.layoutEdgeIds,
    nodeSizeMap,
    renderedPositionMap,
    useAdvancedAutoRouting
  ]);

  const edgeLaneMap = React.useMemo(() => {
    const laneByEdgeId = new Map<string, number>();
    const byFrom = new Map<NodeId, { id: string; delta: number; needsBend: boolean }[]>();
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      const forceBend = edgeForceBendMap.get(edge.id) || false;
      const needsBend = forceBend || shouldBendEdge(endpoints.from, endpoints.to, layoutDirection, fromSize, toSize);
      if (!needsBend) {
        laneByEdgeId.set(edge.id, 0);
        continue;
      }
      const delta = layoutDirection === 'horizontal'
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
  }, [doc.edges, edgeForceBendMap, getRenderedEdgeEndpoints, layoutDirection, nodeSizeMap, renderedPositionMap]);

  const autoEdgeRouteMap = React.useMemo(() => {
    const map = new Map<string, EdgeRoute>();
    const forwardIncomingManualEdgesByTarget = new Map<NodeId, Set<EdgeId>>();

    for (const edge of doc.edges) {
      if (edgeRoutes[edge.id] || edgeBends[edge.id]) continue;
      if (!edgeForceBendMap.get(edge.id)) continue;
      if (!useAdvancedAutoRouting && edge.role !== 'manual') continue;
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      if (!isForwardIncomingManualEdge(edge, endpoints.from, endpoints.to, layoutDirection, layoutEdgeAnalysis.layoutEdgeIds)) {
        continue;
      }
      const group = forwardIncomingManualEdgesByTarget.get(edge.to) || new Set<EdgeId>();
      group.add(edge.id);
      forwardIncomingManualEdgesByTarget.set(edge.to, group);
    }

    for (const edge of doc.edges) {
      if (edgeRoutes[edge.id] || edgeBends[edge.id]) continue;
      if (!edgeForceBendMap.get(edge.id)) continue;
      if (!useAdvancedAutoRouting && edge.role !== 'manual') continue;
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      const routeNodeBoxes = getRouteNodeBoxes(edge);
      const forwardIncomingManualGroup = forwardIncomingManualEdgesByTarget.get(edge.to);
      const route = forwardIncomingManualGroup && forwardIncomingManualGroup.size >= 2 && forwardIncomingManualGroup.has(edge.id)
        ? routeForwardIncomingConverge(
          endpoints.from,
          endpoints.to,
          layoutDirection,
          layoutDirection === 'horizontal' ? doc.settings.spacing.horizontal : doc.settings.spacing.vertical
        )
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
  }, [
    doc.edges,
    doc.settings.spacing.horizontal,
    doc.settings.spacing.vertical,
    edgeBends,
    edgeForceBendMap,
    edgeLaneMap,
    edgeRoutes,
    getRenderedEdgeEndpoints,
    getRouteNodeBoxes,
    layoutDirection,
    layoutEdgeAnalysis.layoutEdgeIds,
    nodeSizeMap,
    renderedPositionMap,
    useAdvancedAutoRouting
  ]);

  const buildDraggedEdgeRoute = React.useCallback((edgeId: string, pointer: Point): EdgeRoute | undefined => {
    const edge = doc.edges.find(candidate => candidate.id === edgeId);
    if (!edge) return undefined;
    const fromPos = renderedPositionMap.get(edge.from);
    const toPos = renderedPositionMap.get(edge.to);
    if (!fromPos || !toPos) return undefined;
    const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
    const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
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
  }, [
    doc.edges,
    getRenderedEdgeEndpoints,
    getRouteNodeBoxes,
    layoutSpacing,
    layoutDirection,
    nodeSizeMap,
    renderedPositionMap
  ]);

  const tryCreateEdge = React.useCallback(
    (from: NodeId, to: NodeId, anchors?: EdgeAnchors) => {
      if (
        (anchors?.from === 'front' && anchors.to === 'front') ||
        (anchors?.from === 'back' && anchors.to === 'back')
      ) {
        setFileMessage('Connect blocked: use opposite node handles');
        return false;
      }
      let nextFrom = from;
      let nextTo = to;
      let nextAnchors = anchors;
      const sameComponentBeforeConnect = new Set(collectConnectedComponent(doc, from)).has(to);
      const isExplicitOppositeHandleConnection = Boolean(
        isNodeSideAnchor(anchors?.from) &&
          isNodeSideAnchor(anchors.to) &&
          anchors.from !== anchors.to
      );
      if (from === primaryRootNodeId && to !== from && isExplicitOppositeHandleConnection) {
        nextFrom = to;
        nextTo = from;
        nextAnchors = reverseEdgeAnchors(anchors);
      } else if (to === primaryRootNodeId && from !== to && !sameComponentBeforeConnect) {
        nextFrom = to;
        nextTo = from;
        nextAnchors = reverseEdgeAnchors(anchors);
      }
      const fromComponent = new Set(collectConnectedComponent(doc, nextFrom));
      const mergesTwoComponents = !fromComponent.has(nextTo);
      const mergedComponentNodeIds = mergesTwoComponents
        ? new Set([...fromComponent, ...collectConnectedComponent(doc, nextTo)])
        : null;
      const edgeRole = mergesTwoComponents ? 'layout' : 'manual';
      const validation = validateEdge(doc, nextFrom, nextTo, edgeRole, nextAnchors);
      if (!validation.ok) {
        if (validation.reason === 'self-edge') setFileMessage('Connect blocked: source and target are the same node');
        if (validation.reason === 'duplicate-edge') setFileMessage('Connect blocked: edge already exists');
        if (validation.reason === 'same-side-anchors') setFileMessage('Connect blocked: use opposite node handles');
        return false;
      }
      const shouldNormalizeAttachedRoot =
        rootNodeIds.has(nextTo) && nextTo !== primaryRootNodeId;
      commitDoc(prev => {
        const withEdge = addEdge(prev, nextFrom, nextTo, edgeRole, nextAnchors);
        return shouldNormalizeAttachedRoot
          ? updateNodeStyle(withEdge, [nextTo], createChildNodeStyle(withEdge.settings.defaultShape))
          : withEdge;
      });
      if (mergedComponentNodeIds) {
        setCurrentNodeOffsets(prev => {
          const next = { ...prev };
          for (const nodeId of mergedComponentNodeIds) {
            delete next[nodeId];
          }
          return next;
        });
      }
      return true;
    },
    [commitDoc, doc, primaryRootNodeId, rootNodeIds, setCurrentNodeOffsets]
  );

  const dragInsertPreview = React.useMemo(() => {
    if (!dragState) return null;
    const preview = getLayerReorderPreview(
      layout.positions,
      nodeOffsets,
      dragState.nodeIds,
      dragState.anchorNodeId,
      layoutDirection,
      getLayoutSecondaryGap(layoutDirection)
    );
    if (!preview) return null;

    const layerIds = layout.positions
      .filter(pos => (layoutDirection === 'horizontal' ? pos.x === preview.primary : pos.y === preview.primary))
      .map(pos => pos.id);
    if (layerIds.length === 0) return null;

    const extents = layerIds
      .map(id => {
        const rendered = renderedPositionMap.get(id);
        const size = nodeSizeMap[id] || DEFAULT_NODE_SIZE;
        if (!rendered) return null;
        return {
          minX: rendered.x,
          maxX: rendered.x + size.width,
          minY: rendered.y,
          maxY: rendered.y + size.height
        };
      })
      .filter((item): item is { minX: number; maxX: number; minY: number; maxY: number } => item !== null);
    if (extents.length === 0) return null;

    const minX = Math.min(...extents.map(item => item.minX));
    const maxX = Math.max(...extents.map(item => item.maxX));
    const minY = Math.min(...extents.map(item => item.minY));
    const maxY = Math.max(...extents.map(item => item.maxY));

    return layoutDirection === 'horizontal'
      ? {
          left: minX - 8,
          top: preview.secondary - 1,
          width: Math.max(16, maxX - minX + 16),
          height: 2
        }
      : {
          left: preview.secondary - 1,
          top: minY - 8,
          width: 2,
          height: Math.max(16, maxY - minY + 16)
        };
  }, [dragState, layout.positions, layoutDirection, nodeOffsets, nodeSizeMap, renderedPositionMap]);

  const canvasSize = React.useMemo(() => {
    const boxes = doc.nodes.map(node => {
      const pos = renderedPositionMap.get(node.id);
      const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
      if (!pos) return null;
      return { x: pos.x, y: pos.y, width: size.width, height: size.height };
    });
    const maxX = boxes.reduce((acc, box) => Math.max(acc, box ? box.x + box.width : 0), 0);
    const maxY = boxes.reduce((acc, box) => Math.max(acc, box ? box.y + box.height : 0), 0);
    return {
      width: Math.max(980, maxX + 120),
      height: Math.max(520, maxY + 120)
    };
  }, [doc.nodes, nodeSizeMap, renderedPositionMap]);

  const fitCanvasToView = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || doc.nodes.length === 0) return;
    const padding = 96;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of doc.nodes) {
      const pos = renderedPositionMap.get(node.id);
      if (!pos) continue;
      const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + size.width);
      maxY = Math.max(maxY, pos.y + size.height);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
    const boundsWidth = Math.max(1, maxX - minX + padding * 2);
    const boundsHeight = Math.max(1, maxY - minY + padding * 2);
    const nextZoom = clamp(
      Number(Math.min(canvas.clientWidth / boundsWidth, canvas.clientHeight / boundsHeight, 1.25).toFixed(2)),
      0.5,
      2.5
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setCanvasZoom(nextZoom);
    requestAnimationFrame(() => {
      const maxScrollLeft = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
      const maxScrollTop = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
      canvas.scrollTo({
        left: clamp(centerX * nextZoom - canvas.clientWidth / 2, 0, maxScrollLeft),
        top: clamp(centerY * nextZoom - canvas.clientHeight / 2, 0, maxScrollTop),
        behavior: 'auto'
      });
    });
  }, [doc.nodes, nodeSizeMap, renderedPositionMap]);

  const buildSvgSnapshot = React.useCallback(() => {
    const nodes: SvgNodeSnapshot[] = doc.nodes
      .map(node => {
        const pos = renderedPositionMap.get(node.id);
        if (!pos) return null;
        const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
        return {
          id: node.id,
          label: node.label,
          style: node.style,
          isRoot: rootNodeIds.has(node.id),
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height
        };
      })
      .filter((item): item is SvgNodeSnapshot => item !== null);

    const edges: SvgEdgeSnapshot[] = [];
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
      edges.push({
        id: edge.id,
        from: endpoints.from,
        to: endpoints.to,
        lane: edgeLaneMap.get(edge.id) || 0,
        fromSize,
        toSize,
        forceBend: edgeForceBendMap.get(edge.id) || false,
        style: effectiveEdgeStyle(edge, doc.settings.defaultEdgeStyle),
        ...(route ? { route } : {})
      });
    }
    return { nodes, edges };
  }, [autoEdgeRouteMap, doc.edges, doc.nodes, doc.settings.defaultEdgeStyle, edgeBends, edgeForceBendMap, edgeLaneMap, edgeRoutes, getRenderedEdgeEndpoints, nodeSizeMap, renderedPositionMap, rootNodeIds]);

  const buildCanvasSvg = React.useCallback((fitToContent = false) => {
    const snapshot = buildSvgSnapshot();
    let offsetX = 0;
    let offsetY = 0;
    let svgWidth = canvasSize.width;
    let svgHeight = canvasSize.height;

    if (fitToContent && (snapshot.nodes.length > 0 || snapshot.edges.length > 0)) {
      const padding = 48;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const node of snapshot.nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
      }

      for (const edge of snapshot.edges) {
        const routePoints = edge.route?.points || [];
        minX = Math.min(minX, edge.from.x, edge.to.x, ...routePoints.map(point => point.x));
        minY = Math.min(minY, edge.from.y, edge.to.y, ...routePoints.map(point => point.y));
        maxX = Math.max(maxX, edge.from.x, edge.to.x, ...routePoints.map(point => point.x));
        maxY = Math.max(maxY, edge.from.y, edge.to.y, ...routePoints.map(point => point.y));
      }

      if (Number.isFinite(minX) && Number.isFinite(minY)) {
        offsetX = padding - minX;
        offsetY = padding - minY;
        svgWidth = Math.ceil(maxX - minX + padding * 2);
        svgHeight = Math.ceil(maxY - minY + padding * 2);
      }
    }

    const shiftPoint = (point: Point): Point => ({ x: point.x + offsetX, y: point.y + offsetY });
    const edgeMarkup = snapshot.edges
      .map(
        edge => {
          const from = shiftPoint(edge.from);
          const to = shiftPoint(edge.to);
          const route = edge.route
            ? { points: edge.route.points.map(point => shiftPoint(point)) }
            : undefined;
          const dash = edgeStrokeDasharray(edge.style.lineType, edge.style.width);
          const dashMarkup = dash ? ` stroke-dasharray="${dash}"` : '';
          return `<path d="${edgePath(from, to, edge.lane, layoutDirection, edge.fromSize, edge.toSize, edge.forceBend, route)}" stroke="${edge.style.color}" stroke-width="${edge.style.width}"${dashMarkup} fill="none" stroke-linecap="round" />`;
        }
      )
      .join('');
    const nodeMarkup = snapshot.nodes
      .map(
        node => {
          const text = clampNodeLabel(node.label).replace(/\r?\n/g, ' ') || ' ';
          const style = node.style || {};
          const shape = style.shape || (node.isRoot ? 'rounded' : doc.settings.defaultShape);
          const fill = style.backgroundColor || (node.isRoot ? activeTheme.rootBg : activeTheme.nodeBg);
          const textColor = style.textColor || (node.isRoot ? activeTheme.rootText : activeTheme.nodeText);
          const fontSize = style.fontSize || DEFAULT_FONT_SIZE;
          const fontWeight = style.bold ? 700 : 400;
          const fontStyle = style.italic ? 'italic' : 'normal';
          const textDecoration = style.underline ? 'underline' : 'none';
          const radius =
            shape === 'pill' ? node.height / 2 : shape === 'square' || shape === 'underline' || shape === 'plain' ? 0 : 8;
          const textAnchor = style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start';
          const textX =
            style.textAlign === 'center'
              ? node.width / 2
              : style.textAlign === 'right'
                ? node.width - NODE_PADDING_X
                : NODE_PADDING_X;
          const textY = Math.round(node.height / 2 + fontSize * 0.35);
          const textMarkup = `<text x="${textX}" y="${textY}" text-anchor="${textAnchor}" font-family="${escapeXml(style.fontFamily || DEFAULT_FONT_FAMILY)}, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" text-decoration="${textDecoration}" fill="${textColor}">${escapeXml(text)}</text>`;
          const x = node.x + offsetX;
          const y = node.y + offsetY;
          if (shape === 'underline') {
            return `<g transform="translate(${x},${y})"><line x1="0" y1="${node.height - 1}" x2="${node.width}" y2="${node.height - 1}" stroke="${activeTheme.edge}" stroke-width="2" />${textMarkup}</g>`;
          }
          if (shape === 'plain') {
            return `<g transform="translate(${x},${y})">${textMarkup}</g>`;
          }
          return `<g transform="translate(${x},${y})"><rect rx="${radius}" ry="${radius}" width="${node.width}" height="${node.height}" fill="${fill}" stroke="${activeTheme.edge}" />${textMarkup}</g>`;
        }
      )
      .join('');
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
      `<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="${activeTheme.canvas}" />`,
      edgeMarkup,
      nodeMarkup,
      '</svg>'
    ].join('');
  }, [activeTheme.canvas, activeTheme.edge, activeTheme.nodeBg, activeTheme.nodeText, activeTheme.rootBg, activeTheme.rootText, buildSvgSnapshot, canvasSize.height, canvasSize.width, doc.settings.defaultShape, layoutDirection]);

  React.useEffect(() => {
    const nodeIds = doc.nodes.map(node => node.id);
    const valid = new Set(nodeIds);
    setSelectedNodeIds(prev => {
      const filtered = prev.filter(id => valid.has(id));
      return filtered;
    });
    if (selectedEdgeId && !doc.edges.some(edge => edge.id === selectedEdgeId)) {
      setSelectedEdgeId('');
    }
  }, [doc.edges, doc.nodes, selectedEdgeId]);

  React.useEffect(() => {
    if (!selectedRouteControl) return;
    if (selectedRouteControl.edgeId !== selectedEdgeId) {
      setSelectedRouteControl(null);
      return;
    }
    const route = edgeRoutes[selectedRouteControl.edgeId];
    if (!route || !route.points[selectedRouteControl.pointIndex]) {
      setSelectedRouteControl(null);
    }
  }, [edgeRoutes, selectedEdgeId, selectedRouteControl]);

  React.useEffect(() => {
    if (!editingNodeId) return;
    if (!doc.nodes.some(node => node.id === editingNodeId)) {
      setEditingNodeId(null);
      setEditingLabel('');
      editingNodeIdRef.current = null;
      editingLabelRef.current = '';
    }
  }, [doc.nodes, editingNodeId]);

  React.useEffect(() => {
    const validIds = new Set(doc.nodes.map(node => node.id));
    updateActiveTab(tab => {
      const prune = (map: NodeOffsetMap) => {
        const next: NodeOffsetMap = {};
        for (const [id, offset] of Object.entries(map)) {
          if (validIds.has(id)) next[id] = offset;
        }
        return next;
      };
      const nextHorizontal = prune(tab.nodeOffsetsByDirection.horizontal);
      const nextVertical = prune(tab.nodeOffsetsByDirection.vertical);
      const validEdgeIds = new Set(tab.history.present.edges.map(edge => edge.id));
      const pruneBends = (map: EdgeBendMap) => {
        const next: EdgeBendMap = {};
        for (const [id, bend] of Object.entries(map)) {
          if (validEdgeIds.has(id)) next[id] = bend;
        }
        return next;
      };
      const pruneRoutes = (map: EdgeRouteMap) => {
        const next: EdgeRouteMap = {};
        for (const [id, route] of Object.entries(map)) {
          if (validEdgeIds.has(id) && route.points.length > 0) next[id] = route;
        }
        return next;
      };
      return {
        ...tab,
        nodeOffsetsByDirection: { horizontal: nextHorizontal, vertical: nextVertical },
        edgeBendsByDirection: {
          horizontal: pruneBends(tab.edgeBendsByDirection.horizontal),
          vertical: pruneBends(tab.edgeBendsByDirection.vertical)
        },
        edgeRoutesByDirection: {
          horizontal: pruneRoutes(tab.edgeRoutesByDirection.horizontal),
          vertical: pruneRoutes(tab.edgeRoutesByDirection.vertical)
        }
      };
    });
  }, [doc.edges, doc.nodes, updateActiveTab]);

  const deleteSelectedEdge = React.useCallback(() => {
    if (!selectedEdgeId) return;
    commitDoc(prev => removeEdge(prev, selectedEdgeId));
    setSelectedEdgeId('');
    setSelectedRouteControl(null);
  }, [commitDoc, selectedEdgeId]);

  const deleteSelectedNodes = React.useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    commitDoc(prev => removeNodes(prev, selectedNodeIds));
    setSelectedNodeIds([]);
  }, [commitDoc, selectedNodeIds]);

  const copySelectedNodes = React.useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    setCopiedSelection(extractSelection(doc, selectedNodeIds));
  }, [doc, selectedNodeIds]);

  const pasteSelectedNodes = React.useCallback(() => {
    if (!copiedSelection || copiedSelection.nodes.length === 0) return;
    const result = pasteDetached(doc, copiedSelection);
    commitDoc(() => ensureDocHasNode(result.doc));
    setSelectedNodeIds(result.newNodeIds);
    setSelectedEdgeId('');
    setCurrentNodeOffsets(prev => {
      const next = { ...prev };
      for (const id of result.newNodeIds) next[id] = { dx: 40, dy: 40 };
      return next;
    });
  }, [commitDoc, copiedSelection, doc, setCurrentNodeOffsets]);

  const startEditingNode = React.useCallback((nodeId: NodeId) => {
    const node = doc.nodes.find(item => item.id === nodeId);
    if (!node) return;
    const label = clampNodeLabel(node.label);
    editingNodeIdRef.current = nodeId;
    editingLabelRef.current = label;
    setEditingNodeId(nodeId);
    setEditingLabel(label);
  }, [doc.nodes]);

  const updateEditingLabel = React.useCallback((value: string) => {
    const label = clampNodeLabel(value);
    editingLabelRef.current = label;
    setEditingLabel(label);
  }, []);

  const commitEditingNode = React.useCallback(() => {
    const nodeId = editingNodeIdRef.current;
    if (!nodeId) return;
    const nextLabel = clampNodeLabel(editingLabelRef.current).trim();
    editingNodeIdRef.current = null;
    editingLabelRef.current = '';
    setEditingNodeId(null);
    setEditingLabel('');
    const currentNode = doc.nodes.find(node => node.id === nodeId);
    if (currentNode?.label === nextLabel) return;
    commitDoc(prev => updateNodeLabel(prev, nodeId, nextLabel));
  }, [commitDoc, doc.nodes]);

  const selectOutlineNode = React.useCallback(
    (nodeId: NodeId) => {
      if (editingNodeIdRef.current) commitEditingNode();
      setSelectedNodeIds([nodeId]);
      selectedNodeIdsRef.current = [nodeId];
      setSelectedEdgeId('');
      setSelectedRouteControl(null);
      requestAnimationFrame(() => scrollNodeIntoCanvas(nodeId));
    },
    [commitEditingNode, scrollNodeIntoCanvas]
  );

  const toggleOutlineNode = React.useCallback((nodeId: NodeId) => {
    setCollapsedOutlineNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const createLinkedNodeFromSelection = React.useCallback(() => {
    const currentSelection = selectedNodeIdsRef.current;
    if (currentSelection.length !== 1) return;
    const parentId = currentSelection[0];
    const parentOffset = getNodeOffset(nodeOffsets, parentId);
    const newNodeId = `n${doc.meta.nextNodeSeq}`;
    const newLabel = NEW_NODE_LABEL;
    commitDoc(prev => {
      let next = addNode(prev, newLabel, createChildNodeStyle(prev.settings.defaultShape));
      next = addEdge(next, parentId, newNodeId);
      return next;
    });
    setCurrentNodeOffsets(prev => ({
      ...prev,
      [newNodeId]: { dx: parentOffset.dx, dy: parentOffset.dy }
    }));
    setSelectedNodeIds([newNodeId]);
    selectedNodeIdsRef.current = [newNodeId];
    setSelectedEdgeId('');
    editingNodeIdRef.current = newNodeId;
    editingLabelRef.current = newLabel;
    setEditingNodeId(newNodeId);
    setEditingLabel(newLabel);
  }, [commitDoc, doc.meta.nextNodeSeq, nodeOffsets, setCurrentNodeOffsets]);

  const createSiblingNodeFromSelection = React.useCallback(() => {
    const currentSelection = selectedNodeIdsRef.current;
    if (currentSelection.length !== 1) return;
    const selectedNodeId = currentSelection[0];
    const parentId = getPrimaryParentId(doc, selectedNodeId);
    if (!parentId) {
      createLinkedNodeFromSelection();
      return;
    }
    const parentOffset = getNodeOffset(nodeOffsets, parentId);
    const newNodeId = `n${doc.meta.nextNodeSeq}`;
    const newLabel = NEW_NODE_LABEL;
    commitDoc(prev => {
      let next = addNode(prev, newLabel, createChildNodeStyle(prev.settings.defaultShape));
      next = addEdge(next, parentId, newNodeId);
      return next;
    });
    setCurrentNodeOffsets(prev => ({
      ...prev,
      [newNodeId]: { dx: parentOffset.dx, dy: parentOffset.dy }
    }));
    setSelectedNodeIds([newNodeId]);
    selectedNodeIdsRef.current = [newNodeId];
    setSelectedEdgeId('');
    editingNodeIdRef.current = newNodeId;
    editingLabelRef.current = newLabel;
    setEditingNodeId(newNodeId);
    setEditingLabel(newLabel);
  }, [
    commitDoc,
    createLinkedNodeFromSelection,
    doc,
    doc.meta.nextNodeSeq,
    nodeOffsets,
    setCurrentNodeOffsets
  ]);

  const selectNodeByDirection = React.useCallback((directionKey: string) => {
    const currentSelection = selectedNodeIdsRef.current;
    if (currentSelection.length !== 1) return false;
    const selectedNodeId = currentSelection[0];
    const selectedPos = renderedPositionMap.get(selectedNodeId);
    if (!selectedPos) return false;
    const selectedSize = nodeSizeMap[selectedNodeId] || DEFAULT_NODE_SIZE;
    const selectedCenter = getNodeCenter(selectedPos.x, selectedPos.y, selectedSize);
    const candidates = doc.nodes
      .filter(node => node.id !== selectedNodeId)
      .map(node => {
        const pos = renderedPositionMap.get(node.id);
        if (!pos) return null;
        const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
        const center = getNodeCenter(pos.x, pos.y, size);
        const dx = center.x - selectedCenter.x;
        const dy = center.y - selectedCenter.y;
        let primaryDelta = 0;
        let secondaryDelta = 0;
        if (directionKey === 'arrowright') {
          if (dx <= 0) return null;
          primaryDelta = dx;
          secondaryDelta = Math.abs(dy);
        } else if (directionKey === 'arrowleft') {
          if (dx >= 0) return null;
          primaryDelta = Math.abs(dx);
          secondaryDelta = Math.abs(dy);
        } else if (directionKey === 'arrowdown') {
          if (dy <= 0) return null;
          primaryDelta = dy;
          secondaryDelta = Math.abs(dx);
        } else if (directionKey === 'arrowup') {
          if (dy >= 0) return null;
          primaryDelta = Math.abs(dy);
          secondaryDelta = Math.abs(dx);
        } else {
          return null;
        }
        return {
          nodeId: node.id,
          score: secondaryDelta * 1000 + primaryDelta
        };
      })
      .filter((entry): entry is { nodeId: NodeId; score: number } => Boolean(entry))
      .sort((a, b) => a.score - b.score);
    const next = candidates[0]?.nodeId;
    if (!next) return false;
    setSelectedNodeIds([next]);
    selectedNodeIdsRef.current = [next];
    setSelectedEdgeId('');
    setSelectedRouteControl(null);
    return true;
  }, [doc.nodes, nodeSizeMap, renderedPositionMap]);

  const reorderSelectedNodeSibling = React.useCallback(
    (direction: -1 | 1) => {
      const currentSelection = selectedNodeIdsRef.current;
      if (currentSelection.length !== 1) return false;
      const selectedNodeId = currentSelection[0];
      let changed = false;
      commitDoc(prev => {
        const parentEdge = getPrimaryParentEdge(prev, selectedNodeId);
        if (!parentEdge) return prev;
        const siblings = getOrderedLayoutChildEdges(prev, parentEdge.from);
        const selectedIndex = siblings.findIndex(edge => edge.id === parentEdge.id);
        const targetIndex = selectedIndex + direction;
        if (selectedIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return prev;

        const siblingOrderById = new Map<string, number>();
        siblings.forEach((edge, index) => {
          siblingOrderById.set(edge.id, typeof edge.order === 'number' ? edge.order : index + 1);
        });
        const selectedOrder = siblingOrderById.get(siblings[selectedIndex].id)!;
        const targetOrder = siblingOrderById.get(siblings[targetIndex].id)!;
        siblingOrderById.set(siblings[selectedIndex].id, targetOrder);
        siblingOrderById.set(siblings[targetIndex].id, selectedOrder);
        changed = true;

        return {
          ...prev,
          edges: prev.edges.map(edge =>
            siblingOrderById.has(edge.id) ? { ...edge, order: siblingOrderById.get(edge.id)! } : edge
          )
        };
      });
      if (changed) {
        setSelectedNodeIds([selectedNodeId]);
        selectedNodeIdsRef.current = [selectedNodeId];
        setSelectedEdgeId('');
        setSelectedRouteControl(null);
      }
      return changed;
    },
    [commitDoc]
  );

  const resetSelectedEdgeBend = React.useCallback(() => {
    if (!selectedEdgeId) return;
    setSelectedRouteControl(null);
    commitEdgeUiChange((snapshot, direction) => {
      const nextBends = cloneEdgeBendsByDirection(snapshot.edgeBendsByDirection);
      const nextRoutes = cloneEdgeRoutesByDirection(snapshot.edgeRoutesByDirection);
      delete nextBends[direction][selectedEdgeId];
      delete nextRoutes[direction][selectedEdgeId];
      return {
        edgeBendsByDirection: nextBends,
        edgeRoutesByDirection: nextRoutes
      };
    });
  }, [commitEdgeUiChange, selectedEdgeId]);

  const hasManualOffset = React.useMemo(
    () =>
      selectedNodeIds.some(nodeId => {
        const offset = getNodeOffset(nodeOffsets, nodeId);
        return offset.dx !== 0 || offset.dy !== 0;
      }),
    [nodeOffsets, selectedNodeIds]
  );

  const resetSelectedNodeOffsets = React.useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    setCurrentNodeOffsets(prev => {
      const next = { ...prev };
      for (const nodeId of selectedNodeIds) {
        delete next[nodeId];
      }
      return next;
    });
  }, [selectedNodeIds, setCurrentNodeOffsets]);

  const applySelectedNodeStyle = React.useCallback(
    (patch: NodeStyle) => {
      if (selectedNodeIds.length === 0) return;
      commitDoc(prev => updateNodeStyle(prev, selectedNodeIds, patch));
    },
    [commitDoc, selectedNodeIds]
  );

  const updateTaskTableField = React.useCallback(
    (nodeId: NodeId, patch: Partial<NodeTask>) => {
      commitDoc(prev => updateNodeTask(prev, [nodeId], { enabled: true, ...patch }));
    },
    [commitDoc]
  );

  const toggleTaskTableSort = React.useCallback((key: TaskTableSortKey) => {
    setTaskTableSort(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const applySelectedEdgeStyle = React.useCallback(
    (patch: EdgeStyle) => {
      if (selectedStyleEdges.length === 0) return;
      commitDoc(prev => updateEdgeStyle(prev, selectedStyleEdges.map(edge => edge.id), patch));
    },
    [commitDoc, selectedStyleEdges]
  );

  const applyDefaultEdgeStyle = React.useCallback(
    (patch: EdgeStyle) => {
      commitDoc(prev =>
        updateSettings(prev, {
          defaultEdgeStyle: {
            ...prev.settings.defaultEdgeStyle,
            ...patch
          }
        })
      );
    },
    [commitDoc]
  );

  const clearSelectedNodeStyle = React.useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    commitDoc(prev => resetNodeStyle(prev, selectedNodeIds));
  }, [commitDoc, selectedNodeIds]);

  const applyTheme = React.useCallback(
    (themeId: string) => {
      commitDoc(prev => updateSettings(prev, { themeId }));
    },
    [commitDoc]
  );

  const applySpacing = React.useCallback(
    (key: 'horizontal' | 'vertical', value: number) => {
      const nextValue = clamp(value, SPACING_MIN, SPACING_MAX);
      commitDoc(prev =>
        updateSettings(prev, {
          spacing: {
            ...prev.settings.spacing,
            [key]: nextValue
          }
        })
      );
    },
    [commitDoc]
  );

  const addCustomTag = React.useCallback(() => {
    const id = nextCustomTagId(doc.settings.tags);
    commitDoc(prev => upsertTag(prev, { id, name: 'New Tag', color: newTagColor }));
  }, [commitDoc, doc.settings.tags, newTagColor]);

  const renameTag = React.useCallback(
    (tag: FlowTag, name: string) => {
      commitDoc(prev => upsertTag(prev, { ...tag, name }));
    },
    [commitDoc]
  );

  const removeTagById = React.useCallback(
    (tagId: string) => {
      commitDoc(prev => deleteTag(prev, tagId));
    },
    [commitDoc]
  );

  const setToolbarVisible = React.useCallback(
    (visible: boolean) => {
      updateActiveTab(tab => ({ ...tab, toolbarVisible: visible }));
    },
    [updateActiveTab]
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditor =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoInteraction();
        return;
      }
      if (mod && ((key === 'z' && event.shiftKey) || key === 'y')) {
        event.preventDefault();
        redoInteraction();
        return;
      }
      if (mod && key === 'n') {
        event.preventDefault();
        createNewDocument();
        return;
      }
      if (mod && key === 'o') {
        event.preventDefault();
        void openDocument();
        return;
      }
      if (mod && key === 's' && event.shiftKey) {
        event.preventDefault();
        void saveDocument(true);
        return;
      }
      if (mod && key === 's') {
        event.preventDefault();
        void saveDocument(false);
        return;
      }
      if (mod && key === '0') {
        event.preventDefault();
        fitCanvasToView();
        return;
      }
      if (inEditor) return;
      const latestSelectedNodeIds = selectedNodeIdsRef.current;
      if (mod && key === 'c') {
        event.preventDefault();
        copySelectedNodes();
        return;
      }
      if (mod && key === 'v') {
        event.preventDefault();
        pasteSelectedNodes();
        return;
      }
      if (key === 'tab' && latestSelectedNodeIds.length === 1) {
        event.preventDefault();
        createLinkedNodeFromSelection();
        return;
      }
      if (key === 'enter' && latestSelectedNodeIds.length === 1) {
        event.preventDefault();
        createSiblingNodeFromSelection();
        return;
      }
      if (mod && latestSelectedNodeIds.length === 1 && (key === 'arrowup' || key === 'arrowdown')) {
        event.preventDefault();
        reorderSelectedNodeSibling(key === 'arrowdown' ? 1 : -1);
        return;
      }
      if (latestSelectedNodeIds.length > 0 && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
        selectNodeByDirection(key);
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (selectedEdgeId) {
          event.preventDefault();
          deleteSelectedEdge();
          return;
        }
        if (latestSelectedNodeIds.length > 0) {
          event.preventDefault();
          deleteSelectedNodes();
          return;
        }
      }
      if (key === ' ' && latestSelectedNodeIds.length === 1) {
        event.preventDefault();
        startEditingNode(latestSelectedNodeIds[0]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    copySelectedNodes,
    createLinkedNodeFromSelection,
    createSiblingNodeFromSelection,
    createNewDocument,
    deleteSelectedEdge,
    deleteSelectedNodes,
    openDocument,
    pasteSelectedNodes,
    redoInteraction,
    reorderSelectedNodeSibling,
    saveDocument,
    selectNodeByDirection,
    setCanvasZoom,
    selectedEdgeId,
    startEditingNode,
    fitCanvasToView,
    undoInteraction
  ]);

  const onCanvasWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const oldZoom = canvasZoom;
      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      const nextZoom = clamp(Number((oldZoom + delta).toFixed(2)), 0.5, 2.5);
      if (nextZoom === oldZoom) return;
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const worldX = (canvas.scrollLeft + pointerX) / oldZoom;
      const worldY = (canvas.scrollTop + pointerY) / oldZoom;
      setCanvasZoom(nextZoom);
      requestAnimationFrame(() => {
        canvas.scrollTo({
          left: Math.max(0, worldX * nextZoom - pointerX),
          top: Math.max(0, worldY * nextZoom - pointerY)
        });
      });
    },
    [canvasZoom]
  );

  React.useEffect(() => {
    if (!dragState) return;
    const dragNodeSet = new Set(dragState.nodeIds);
    const dragCollisionGap = 10;
    const snapThreshold = 14;
    const dragThreshold = 3;
    const baseById = new Map(layout.positions.map(pos => [pos.id, pos]));
    const onPointerMove = (event: PointerEvent) => {
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      const deltaX = pointer.x - dragState.startX;
      const deltaY = pointer.y - dragState.startY;
      if (!dragDidMoveRef.current && Math.hypot(deltaX, deltaY) < dragThreshold) return;
      dragDidMoveRef.current = true;
      updateActiveTab(tab => {
        const direction = tab.layoutDirection;
        const prev = tab.nodeOffsetsByDirection[direction];
        let next = { ...prev };
        let appliedDeltaX = deltaX;
        let appliedDeltaY = deltaY;
        for (const nodeId of dragState.nodeIds) {
          const startOffset = dragState.startOffsets[nodeId] || { dx: 0, dy: 0 };
          next[nodeId] = { dx: startOffset.dx + deltaX, dy: startOffset.dy + deltaY };
        }
        const anchorBase = baseById.get(dragState.anchorNodeId);
        const anchorSize = nodeSizeMap[dragState.anchorNodeId] || DEFAULT_NODE_SIZE;
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
            const rootSize = nodeSizeMap[rootId] || DEFAULT_NODE_SIZE;
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

        const staticBoxes: NodeBox[] = [];
        for (const node of doc.nodes) {
          if (dragNodeSet.has(node.id)) continue;
          const base = baseById.get(node.id);
          if (!base) continue;
          const size = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
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
          const size = nodeSizeMap[nodeId] || DEFAULT_NODE_SIZE;
          const offset = getNodeOffset(next, nodeId);
          const movingBox: NodeBox = {
            left: base.x + offset.dx,
            right: base.x + offset.dx + size.width,
            top: base.y + offset.dy,
            bottom: base.y + offset.dy + size.height
          };
          if (staticBoxes.some(box => boxesOverlap(movingBox, box, dragCollisionGap))) {
            return tab;
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
          ...tab,
          nodeOffsetsByDirection: {
            ...tab.nodeOffsetsByDirection,
            [direction]: next
          },
          edgeBendsByDirection: {
            ...tab.edgeBendsByDirection,
            [direction]: nextBendsForDirection
          },
          edgeRoutesByDirection: {
            ...tab.edgeRoutesByDirection,
            [direction]: nextRoutesForDirection
          }
        };
      });
      if (dragState.nodeIds.length === 1) {
        const x = pointer.x;
        const y = pointer.y;
        const ordered = [...layout.positions].reverse();
        let candidate: NodeId | null = null;
        for (const pos of ordered) {
          if (pos.id === dragState.anchorNodeId) continue;
          const rendered = renderedPositionMap.get(pos.id);
          const nodeSize = nodeSizeMap[pos.id] || DEFAULT_NODE_SIZE;
          if (!rendered) continue;
          const hit = x >= rendered.x && x <= rendered.x + nodeSize.width && y >= rendered.y && y <= rendered.y + nodeSize.height;
          if (hit) {
            candidate = pos.id;
            break;
          }
        }
        setDropParentTargetId(candidate);
      }
    };
    const onPointerUp = (event: PointerEvent | MouseEvent) => {
      if (!dragDidMoveRef.current) {
        setDragState(null);
        setDropParentTargetId(null);
        return;
      }
      const isRootDrag = rootNodeIds.has(dragState.anchorNodeId);
      let finalDropParentTargetId = dropParentTargetId;
      if (dragState.nodeIds.length === 1) {
        finalDropParentTargetId = null;
        const pointer = getCanvasContentPoint(event.clientX, event.clientY);
        if (pointer) {
          const ordered = [...layout.positions].reverse();
          for (const pos of ordered) {
            if (pos.id === dragState.anchorNodeId) continue;
            const rendered = renderedPositionMap.get(pos.id);
            const nodeSize = nodeSizeMap[pos.id] || DEFAULT_NODE_SIZE;
            if (!rendered) continue;
            const hit =
              pointer.x >= rendered.x &&
              pointer.x <= rendered.x + nodeSize.width &&
              pointer.y >= rendered.y &&
              pointer.y <= rendered.y + nodeSize.height;
            if (hit) {
              finalDropParentTargetId = pos.id;
              break;
            }
          }
        }
      }
      if (dragState.nodeIds.length === 1 && finalDropParentTargetId && !isRootDrag) {
        const movingNodeId = dragState.anchorNodeId;
        const nextDoc = reparentNode(doc, movingNodeId, finalDropParentTargetId);
        const anchorRootId = primaryRootNodeId || doc.nodes[0]?.id || movingNodeId;
        const rootRenderedBefore = renderedPositionMap.get(anchorRootId);
        const nextLayoutEdgeAnalysis = analyzeLayoutEdges(nextDoc);
        const nextLayoutDoc = { ...nextDoc, edges: nextLayoutEdgeAnalysis.layoutEdges };
        const nextLayout = layoutFlow(nextLayoutDoc, layoutDirection, nodeSizeMap, layoutSpacing);
        const rootBaseAfter = nextLayout.positions.find(pos => pos.id === anchorRootId);
        commitDoc(() => nextDoc);
        if (rootRenderedBefore && rootBaseAfter) {
          const nextComponentIds = collectEdgeComponent(
            nextDoc,
            anchorRootId,
            nextLayoutEdgeAnalysis.layoutEdgeIds
          );
          const preservedOffset = {
            dx: rootRenderedBefore.x - rootBaseAfter.x,
            dy: rootRenderedBefore.y - rootBaseAfter.y
          };
          setCurrentNodeOffsets(prev => {
            const next = { ...prev };
            for (const nodeId of nextComponentIds) {
              if (preservedOffset.dx === 0 && preservedOffset.dy === 0) {
                delete next[nodeId];
              } else {
                next[nodeId] = preservedOffset;
              }
            }
            return next;
          });
        } else {
          restoreCurrentNodeOffsets(dragState.startOffsets);
        }
        setSelectedNodeIds([movingNodeId]);
      } else if (!isRootDrag) {
        updateActiveTab(tab => {
          const nextOffsets = { ...tab.nodeOffsetsByDirection[layoutDirection] };
          for (const nodeId of dragState.nodeIds) {
            const startOffset = dragState.startOffsets[nodeId] || { dx: 0, dy: 0 };
            if (startOffset.dx === 0 && startOffset.dy === 0) {
              delete nextOffsets[nodeId];
            } else {
              nextOffsets[nodeId] = startOffset;
            }
          }
          return {
            ...tab,
            nodeOffsetsByDirection: {
              ...tab.nodeOffsetsByDirection,
              [layoutDirection]: nextOffsets
            },
            edgeBendsByDirection: {
              ...tab.edgeBendsByDirection,
              [layoutDirection]: dragState.startEdgeBends
            },
            edgeRoutesByDirection: {
              ...tab.edgeRoutesByDirection,
              [layoutDirection]: dragState.startEdgeRoutes
            }
          };
        });
      }
      setDragState(null);
      setDropParentTargetId(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mouseup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mouseup', onPointerUp);
    };
  }, [autoPanCanvas, commitDoc, doc, dragState, dropParentTargetId, getCanvasContentPoint, layout.positions, layoutDirection, layoutSpacing, nodeSizeMap, primaryRootNodeId, renderedPositionMap, restoreCurrentNodeOffsets, rootNodeIds, setCurrentNodeOffsets, updateActiveTab]);

  const findNodeAtCanvasPoint = React.useCallback((x: number, y: number): NodeId | null => {
    const ordered = [...layout.positions].reverse();
    for (const pos of ordered) {
      const rendered = renderedPositionMap.get(pos.id);
      const nodeSize = nodeSizeMap[pos.id] || DEFAULT_NODE_SIZE;
      if (!rendered) continue;
      const hit =
        x >= rendered.x &&
        x <= rendered.x + nodeSize.width &&
        y >= rendered.y &&
        y <= rendered.y + nodeSize.height;
      if (hit) return pos.id;
    }
    return null;
  }, [layout.positions, nodeSizeMap, renderedPositionMap]);

  const updateConnectDragFromPointer = React.useCallback((event: DragPointerLikeEvent) => {
    autoPanCanvas(event);
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    if (!pointer) return;
    const { x, y } = pointer;
    setConnectDrag(prev => {
      if (!prev) return prev;
      const hitId = findNodeAtCanvasPoint(x, y);
      const hoverTargetNodeId = hitId && hitId !== prev.fromNodeId ? hitId : null;
      const next = { ...prev, current: { x, y }, hoverTargetNodeId };
      connectDragRef.current = next;
      return next;
    });
  }, [autoPanCanvas, findNodeAtCanvasPoint, getCanvasContentPoint]);

  const finishConnectDragFromPointer = React.useCallback((event: DragPointerLikeEvent) => {
    stopConnectDragListeners();
    pendingRightConnectFromRef.current = null;
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    const targetFromEvent = getNodeIdFromEventTarget(event.target);
    const targetFromPoint = getNodeIdFromViewportPoint(event.clientX, event.clientY);
    if (!pointer) {
      connectDragRef.current = null;
      setConnectDrag(null);
      return;
    }
    const { x, y } = pointer;
    const drag = connectDragRef.current;
    connectDragRef.current = null;
    setConnectDrag(null);
    if (!drag) return;
    const targetHandleHit = getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection);
    const targetId = targetHandleHit?.nodeId || targetFromPoint || drag.hoverTargetNodeId || findNodeAtCanvasPoint(x, y) || targetFromEvent;
    if (targetId && targetId !== drag.fromNodeId) {
      const anchors = resolveDraggedEdgeAnchors(
        drag.anchors,
        targetHandleHit?.nodeId === targetId ? targetHandleHit.anchor : undefined
      );
      if (anchors && tryCreateEdge(drag.fromNodeId, targetId, anchors)) {
        setSelectedNodeIds([targetId]);
      }
    }
  }, [findNodeAtCanvasPoint, getCanvasContentPoint, layoutDirection, stopConnectDragListeners, tryCreateEdge]);

  React.useEffect(() => {
    if (!edgeBendDrag) return;
    const moveEdgeBend = (event: PointerEvent | MouseEvent) => {
      event.preventDefault();
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      const route = buildDraggedEdgeRoute(edgeBendDrag.edgeId, pointer);
      if (!route) return;
      setCurrentEdgeBends(prev => {
        const { [edgeBendDrag.edgeId]: _removed, ...rest } = prev;
        return rest;
      });
      setCurrentEdgeRoutes(prev => ({ ...prev, [edgeBendDrag.edgeId]: route }));
    };
    const finishEdgeBend = (event: PointerEvent | MouseEvent) => {
      event.preventDefault();
      commitCurrentEdgeUiSnapshot(edgeBendDragStartSnapshotRef.current);
      edgeBendDragStartSnapshotRef.current = null;
      setEdgeBendDrag(null);
    };
    window.addEventListener('pointermove', moveEdgeBend);
    window.addEventListener('pointerup', finishEdgeBend);
    window.addEventListener('mousemove', moveEdgeBend);
    window.addEventListener('mouseup', finishEdgeBend);
    return () => {
      window.removeEventListener('pointermove', moveEdgeBend);
      window.removeEventListener('pointerup', finishEdgeBend);
      window.removeEventListener('mousemove', moveEdgeBend);
      window.removeEventListener('mouseup', finishEdgeBend);
    };
  }, [
    autoPanCanvas,
    buildDraggedEdgeRoute,
    commitCurrentEdgeUiSnapshot,
    edgeBendDrag,
    getCanvasContentPoint,
    setCurrentEdgeBends,
    setCurrentEdgeRoutes
  ]);

  React.useEffect(() => {
    if (!marquee) return;
    const onPointerMove = (event: PointerEvent) => {
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      const currentX = pointer.x;
      const currentY = pointer.y;
      setMarquee(prev => (prev ? { ...prev, currentX, currentY } : prev));
    };
    const onPointerUp = () => {
      setMarquee(prev => {
        if (!prev) return null;
        const left = Math.min(prev.startX, prev.currentX);
        const right = Math.max(prev.startX, prev.currentX);
        const top = Math.min(prev.startY, prev.currentY);
        const bottom = Math.max(prev.startY, prev.currentY);
        const hits: NodeId[] = [];
        for (const node of doc.nodes) {
          const pos = renderedPositionMap.get(node.id);
          const nodeSize = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
          if (!pos) continue;
          const intersects =
            pos.x < right &&
            pos.x + nodeSize.width > left &&
            pos.y < bottom &&
            pos.y + nodeSize.height > top;
          if (intersects) hits.push(node.id);
        }
        setSelectedNodeIds(hits);
        setSelectedEdgeId('');
        return null;
      });
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [autoPanCanvas, doc.nodes, getCanvasContentPoint, marquee, nodeSizeMap, renderedPositionMap]);

  const startEdgeSegmentDragAtPoint = (
    edgeId: string,
    start: Point,
    getPointerPoint: (clientX: number, clientY: number) => Point | null = getCanvasContentPoint
  ) => {
    stopEdgeSegmentDragListeners();
    setSelectedEdgeId(edgeId);
    setSelectedRouteControl(null);
    setSelectedNodeIds([]);
    const initialEdgeUiSnapshot = getEdgeUiSnapshot(activeTab);
    let didDrag = false;
    const onPointerMove = (nativeEvent: PointerEvent) => {
      autoPanCanvas(nativeEvent);
      const pointer = getPointerPoint(nativeEvent.clientX, nativeEvent.clientY);
      if (!pointer) return;
      if (!didDrag && distanceSquared(start, pointer) < 16) return;
      didDrag = true;
      suppressNextEdgeClickRef.current = true;
      const route = buildDraggedEdgeRoute(edgeId, pointer);
      if (!route) return;
      setCurrentEdgeBends(prev => {
        const { [edgeId]: _removed, ...rest } = prev;
        return rest;
      });
      setCurrentEdgeRoutes(prev => ({ ...prev, [edgeId]: route }));
    };
    const onPointerUp = () => {
      if (didDrag) {
        commitCurrentEdgeUiSnapshot(initialEdgeUiSnapshot);
      }
      setSelectedEdgeId(edgeId);
      setSelectedRouteControl(null);
      setSelectedNodeIds([]);
      stopEdgeSegmentDragListeners();
    };
    edgeSegmentDragListenersRef.current = { onPointerMove, onPointerUp };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const findEdgeHitAtPoint = (point: Point, preferredEdgeId?: string) => {
    type EdgeHitCandidate = {
      edgeId: string;
      endpoints: { from: Point; to: Point };
      route: EdgeRoute | undefined;
      distance: number;
      score: number;
    };
    let best: EdgeHitCandidate | null = null;
    let bestNearbyLayoutEdge: EdgeHitCandidate | null = null;
    let preferred: EdgeHitCandidate | null = null;
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
      const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
      const lane = edgeLaneMap.get(edge.id) || 0;
      const forceBend = edgeForceBendMap.get(edge.id) || false;
      const path = edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, route);
      const distance = distanceToPathSquared(point, path);
      const linearDistance = Math.sqrt(distance);
      const isLayoutEdge = layoutEdgeAnalysis.layoutEdgeIds.has(edge.id);
      const isRoutedEdge = Boolean(edgeRoutes[edge.id] || edgeBends[edge.id] || (route && route.points.length > 1));
      const routeDistance = route ? routeLength([endpoints.from, ...route.points, endpoints.to]) : 0;
      const routeLengthPenalty = isRoutedEdge && !isLayoutEdge
        ? Math.min(18, Math.max(0, (routeDistance - 240) / 70))
        : 0;
      const routePenalty = linearDistance <= 3
        ? 0
        : (isLayoutEdge ? 0 : 8) + (isRoutedEdge ? 6 + routeLengthPenalty : 0);
      const preferredBonus = preferredEdgeId === edge.id && distance <= 18 * 18 ? 16 : 0;
      const score = linearDistance + routePenalty - preferredBonus;
      if (preferredEdgeId === edge.id && distance <= 18 * 18) {
        preferred = { edgeId: edge.id, endpoints, route, distance, score };
      }
      if (!best || score < best.score || (score === best.score && distance < best.distance)) {
        best = { edgeId: edge.id, endpoints, route, distance, score };
      }
      if (isLayoutEdge && distance <= 12 * 12) {
        const layoutScore = linearDistance;
        if (
          !bestNearbyLayoutEdge ||
          layoutScore < bestNearbyLayoutEdge.score ||
          (layoutScore === bestNearbyLayoutEdge.score && distance < bestNearbyLayoutEdge.distance)
        ) {
          bestNearbyLayoutEdge = { edgeId: edge.id, endpoints, route, distance, score: layoutScore };
        }
      }
    }
    if (
      bestNearbyLayoutEdge &&
      preferred &&
      !layoutEdgeAnalysis.layoutEdgeIds.has(preferred.edgeId)
    ) {
      return bestNearbyLayoutEdge;
    }
    if (preferred) {
      return preferred;
    }
    if (
      bestNearbyLayoutEdge &&
      best &&
      best.edgeId !== bestNearbyLayoutEdge.edgeId &&
      !layoutEdgeAnalysis.layoutEdgeIds.has(best.edgeId)
    ) {
      return bestNearbyLayoutEdge;
    }
    return best && best.distance <= 18 * 18 ? best : null;
  };

  const onCanvasPointerDown = (event: React.PointerEvent<Element>) => {
    if (event.target !== event.currentTarget) return;
    if (isNodeLabelInputTarget(event.target)) return;
    if (editingNodeIdRef.current) commitEditingNode();
    if (connectDrag) return;
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    if (!pointer) return;
    const edgeHit = findEdgeHitAtPoint(pointer);
    if (edgeHit && event.button === 0) {
      startEdgeSegmentDragAtPoint(edgeHit.edgeId, pointer, getCanvasContentPoint);
      return;
    }
    const x = pointer.x;
    const y = pointer.y;
    setMarquee({ startX: x, startY: y, currentX: x, currentY: y });
    setSelectedNodeIds([]);
    setSelectedEdgeId('');
  };

  const onNodePointerDown = (event: React.PointerEvent<HTMLButtonElement>, nodeId: NodeId) => {
    if (isNodeLabelInputTarget(event.target)) return;
    if (editingNodeIdRef.current) commitEditingNode();
    if (connectDrag) return;
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      const handleHit = getViewportConnectHandleHit(event.clientX, event.clientY, nodeId, layoutDirection);
      if (handleHit) {
        pendingRightConnectFromRef.current = nodeId;
        const anchors = handleHit.anchor === 'front' ? FRONT_HANDLE_CONNECT_ANCHORS : HANDLE_CONNECT_ANCHORS;
        pendingRightConnectAnchorsRef.current = anchors;
        beginConnectDrag(nodeId, anchors);
        return;
      }
      setSelectedEdgeId('');
      setSelectedNodeIds([nodeId]);
      selectedNodeIdsRef.current = [nodeId];
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    setDragState(null);
    setDropParentTargetId(null);
    setSelectedEdgeId('');
    if (event.shiftKey) {
      const from = selectedNodeIds.length === 1 ? selectedNodeIds[0] : '';
      if (from && from !== nodeId) {
        tryCreateEdge(from, nodeId);
      }
      setSelectedNodeIds([nodeId]);
      selectedNodeIdsRef.current = [nodeId];
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const nextSelection = selectedNodeIdsRef.current.includes(nodeId)
        ? selectedNodeIdsRef.current.filter(id => id !== nodeId)
        : [...selectedNodeIdsRef.current, nodeId];
      selectedNodeIdsRef.current = nextSelection;
      setSelectedNodeIds(nextSelection);
      return;
    }
    const isRootNode = rootNodeIds.has(nodeId);
    const nextSelection: NodeId[] = [nodeId];
    setSelectedNodeIds(nextSelection);
    selectedNodeIdsRef.current = nextSelection;
    const connectedNodeIds = isRootNode
      ? collectEdgeComponent(doc, nodeId, layoutEdgeAnalysis.layoutEdgeIds)
      : [nodeId];
    const startOffsets: Record<NodeId, NodeOffset> = {};
    for (const id of connectedNodeIds) {
      startOffsets[id] = getNodeOffset(nodeOffsets, id);
    }
    const startPoint = getCanvasContentPoint(event.clientX, event.clientY);
    if (!startPoint) return;
    dragDidMoveRef.current = false;
    setDragState({
      nodeIds: connectedNodeIds,
      anchorNodeId: nodeId,
      startX: startPoint.x,
      startY: startPoint.y,
      startOffsets,
      startEdgeBends: cloneEdgeBendMap(edgeBends),
      startEdgeRoutes: cloneEdgeRouteMap(edgeRoutes)
    });
  };

  const onNodeMouseUp = (event: React.MouseEvent<HTMLButtonElement>, nodeId: NodeId) => {
    const drag = connectDragRef.current || connectDrag;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const fromId = drag.fromNodeId;
    pendingRightConnectFromRef.current = null;
    stopConnectDragListeners();
    connectDragRef.current = null;
    setConnectDrag(null);
    const targetHandleHit = getViewportConnectHandleHit(event.clientX, event.clientY, nodeId, layoutDirection);
    const anchors = resolveDraggedEdgeAnchors(drag.anchors, targetHandleHit?.anchor);
    if (fromId !== nodeId && anchors && tryCreateEdge(fromId, nodeId, anchors)) {
      setSelectedNodeIds([nodeId]);
      return;
    }
    setSelectedNodeIds([fromId]);
  };

  const onNodeContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!pendingRightConnectFromRef.current && !connectDrag) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const beginEdgeBendDrag = (edgeId: string, pointIndex: number) => {
    edgeBendDragStartSnapshotRef.current = getEdgeUiSnapshot(activeTab);
    setSelectedEdgeId(edgeId);
    setSelectedNodeIds([]);
    setSelectedRouteControl({ edgeId, pointIndex });
    setEdgeBendDrag({ edgeId, pointIndex });
  };

  const startEdgeBendDrag = (event: React.PointerEvent<SVGCircleElement>, edgeId: string, pointIndex: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    beginEdgeBendDrag(edgeId, pointIndex);
  };

  const startEdgeSegmentDrag = (event: React.PointerEvent<SVGPathElement>) => {
    if (event.button !== 0) return;
    if (editingNodeIdRef.current) commitEditingNode();
    event.stopPropagation();
    const start = getSvgContentPoint(event.currentTarget.ownerSVGElement, event.clientX, event.clientY);
    if (!start) return;
    const edgeHit = findEdgeHitAtPoint(start, event.currentTarget.dataset.edgeId);
    if (!edgeHit) return;
    const svg = event.currentTarget.ownerSVGElement;
    startEdgeSegmentDragAtPoint(edgeHit.edgeId, start, (clientX, clientY) =>
      getSvgContentPoint(svg, clientX, clientY)
    );
  };

  const beginConnectDrag = (nodeId: NodeId, anchors: EdgeAnchors = HANDLE_CONNECT_ANCHORS) => {
    stopConnectDragListeners();
    const nodePos = renderedPositionMap.get(nodeId);
    const nodeSize = nodeSizeMap[nodeId] || DEFAULT_NODE_SIZE;
    if (!nodePos) return;
    const fromAnchor = anchors.from === 'front' ? 'front' : 'back';
    const start = getDirectionalAnchorPoint(nodePos, nodeSize, layoutDirection, fromAnchor);
    const initialDrag = {
      fromNodeId: nodeId,
      anchors,
      start,
      current: start,
      hoverTargetNodeId: null
    };
    connectDragRef.current = initialDrag;
    setConnectDrag(initialDrag);
    const onPointerMove = (nativeEvent: PointerEvent) => updateConnectDragFromPointer(nativeEvent);
    const onPointerUp = (nativeEvent: PointerEvent) => finishConnectDragFromPointer(nativeEvent);
    const onMouseMove = (nativeEvent: MouseEvent) => updateConnectDragFromPointer(nativeEvent);
    const onMouseUp = (nativeEvent: MouseEvent) => finishConnectDragFromPointer(nativeEvent);
    connectDragListenersRef.current = { onPointerMove, onPointerUp, onMouseMove, onMouseUp };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    setSelectedNodeIds([nodeId]);
    setSelectedEdgeId('');
  };

  const startConnectDrag = (event: React.PointerEvent<HTMLSpanElement>, nodeId: NodeId, anchors = HANDLE_CONNECT_ANCHORS) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 2 || event.buttons === 2) {
      pendingRightConnectFromRef.current = nodeId;
    }
    beginConnectDrag(nodeId, anchors);
  };

  React.useEffect(() => {
    const onRightMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) return;
      if (editingNodeId || connectDrag) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const handleHit = getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection);
      const nodeId = getNodeIdFromEventTarget(target) || handleHit?.nodeId;
      if (!nodeId) return;
      if (!target.closest('.node-connect-handle') && !isViewportPointOnConnectHandle(event.clientX, event.clientY, nodeId, layoutDirection)) {
        return;
      }
      event.preventDefault();
      pendingRightConnectFromRef.current = nodeId;
      const anchors = handleHit?.anchor === 'front' ? FRONT_HANDLE_CONNECT_ANCHORS : HANDLE_CONNECT_ANCHORS;
      pendingRightConnectAnchorsRef.current = anchors;
      beginConnectDrag(nodeId, anchors);
    };
    window.addEventListener('mousedown', onRightMouseDown, true);
    return () => window.removeEventListener('mousedown', onRightMouseDown, true);
  }, [beginConnectDrag, connectDrag, editingNodeId, layoutDirection]);

  const onCanvasMouseDownCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const nodeId =
      getNodeIdFromEventTarget(target) ||
      getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection)?.nodeId;
    if (!nodeId) return;
    if (!target.closest('.node-connect-handle') && !isViewportPointOnConnectHandle(event.clientX, event.clientY, nodeId, layoutDirection)) {
      return;
    }
    pendingRightConnectFromRef.current = nodeId;
    const handleHit = getViewportConnectHandleHit(event.clientX, event.clientY, nodeId, layoutDirection);
    const anchors = handleHit?.anchor === 'front' ? FRONT_HANDLE_CONNECT_ANCHORS : HANDLE_CONNECT_ANCHORS;
    pendingRightConnectAnchorsRef.current = anchors;
    event.preventDefault();
    event.stopPropagation();
    beginConnectDrag(nodeId, anchors);
  };

  const onCanvasMouseUpCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    const fromId = pendingRightConnectFromRef.current;
    const anchors = pendingRightConnectAnchorsRef.current;
    pendingRightConnectFromRef.current = null;
    pendingRightConnectAnchorsRef.current = HANDLE_CONNECT_ANCHORS;
    if (!fromId) return;
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    const targetId =
      getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection)?.nodeId ||
      getNodeIdFromViewportPoint(event.clientX, event.clientY) ||
      getNodeIdFromEventTarget(event.target) ||
      (pointer ? findNodeAtCanvasPoint(pointer.x, pointer.y) : null);
    stopConnectDragListeners();
    setConnectDrag(null);
    const targetHandleHit = getConnectHandleHitFromViewportPoint(event.clientX, event.clientY, layoutDirection);
    const resolvedAnchors = resolveDraggedEdgeAnchors(
      anchors,
      targetHandleHit?.nodeId === targetId ? targetHandleHit.anchor : undefined
    );
    if (targetId && targetId !== fromId && resolvedAnchors && tryCreateEdge(fromId, targetId, resolvedAnchors)) {
      setSelectedNodeIds([targetId]);
      return;
    }
    setSelectedNodeIds([fromId]);
  };

  const exportPng = React.useCallback(async () => {
    try {
      const snapshot = buildCanvasSvg(true);
      const svgBlob = new Blob([snapshot], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Failed to render export image'));
        image.src = svgUrl;
      });
      const scale = 2;
      const canvas = document.createElement('canvas');
      const exportWidth = image.naturalWidth || image.width || canvasSize.width;
      const exportHeight = image.naturalHeight || image.height || canvasSize.height;
      canvas.width = exportWidth * scale;
      canvas.height = exportHeight * scale;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context unavailable');
      context.scale(scale, scale);
      context.fillStyle = '#f8fafc';
      context.fillRect(0, 0, exportWidth, exportHeight);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(svgUrl);
      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png');
      });
      const bytes = new Uint8Array(await pngBlob.arrayBuffer());
      const result = await window.flowmaptool.saveBinary({
        dataBase64: bytesToBase64(bytes),
        defaultPath: `${activeTab.title.replace('.qflow', '')}.png`,
        filters: PNG_FILTER
      });
      if (!result) return;
      setFileMessage(`Exported PNG: ${result.filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PNG export failed';
      setFileMessage(`PNG export failed: ${message}`);
    }
  }, [activeTab.title, buildCanvasSvg, canvasSize.height, canvasSize.width]);

  const exportPdf = React.useCallback(async () => {
    try {
      const result = await window.flowmaptool.exportPdfFromSvg({
        svg: buildCanvasSvg(),
        defaultPath: `${activeTab.title.replace('.qflow', '')}.pdf`,
        width: canvasSize.width,
        height: canvasSize.height
      });
      if (!result) return;
      setFileMessage(`Exported PDF: ${result.filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF export failed';
      setFileMessage(`PDF export failed: ${message}`);
    }
  }, [activeTab.title, buildCanvasSvg, canvasSize.height, canvasSize.width]);

  const printDiagram = React.useCallback(async () => {
    try {
      const result = await window.flowmaptool.printSvg({ svg: buildCanvasSvg() });
      setFileMessage(result.success ? 'Print completed' : 'Print canceled');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print failed';
      setFileMessage(`Print failed: ${message}`);
    }
  }, [buildCanvasSvg]);

  const switchLayoutDirection = React.useCallback(
    (direction: LayoutDirection) => {
      updateActiveTab(tab =>
        tab.layoutDirection === direction
          ? tab
          : {
              ...tab,
              layoutDirection: direction
            }
      );
      setSelectedEdgeId('');
      setDropParentTargetId(null);
    },
    [updateActiveTab]
  );

  React.useEffect(() => {
    return window.flowmaptool.onMenuAction(action => {
      if (action === 'file:new') void createNewDocument();
      if (action === 'file:open') void openDocument();
      if (action === 'file:save') void saveDocument(false);
      if (action === 'file:saveAs') void saveDocument(true);
      if (action === 'file:exportPng') void exportPng();
      if (action === 'file:exportPdf') void exportPdf();
      if (action === 'file:print') void printDiagram();
    });
  }, [createNewDocument, exportPdf, exportPng, openDocument, printDiagram, saveDocument]);

  React.useEffect(() => {
    return () => {
      stopConnectDragListeners();
      stopEdgeSegmentDragListeners();
    };
  }, [stopConnectDragListeners, stopEdgeSegmentDragListeners]);

  const getNodeVisualStyle = React.useCallback(
    (nodeId: NodeId, style?: NodeStyle): React.CSSProperties => {
      const isRoot = rootNodeIds.has(nodeId);
      const shape = style?.shape || (isRoot ? 'rounded' : doc.settings.defaultShape);
      const backgroundColor = style?.backgroundColor || (isRoot ? activeTheme.rootBg : activeTheme.nodeBg);
      const textColor = style?.textColor || (isRoot ? activeTheme.rootText : activeTheme.nodeText);
      const borderRadius =
        shape === 'pill' ? 999 : shape === 'square' || shape === 'underline' || shape === 'plain' ? 0 : 8;
      return {
        fontFamily: style?.fontFamily || DEFAULT_FONT_FAMILY,
        fontSize: style?.fontSize || DEFAULT_FONT_SIZE,
        fontWeight: style?.bold ? 700 : 400,
        fontStyle: style?.italic ? 'italic' : 'normal',
        textDecoration: style?.underline ? 'underline' : 'none',
        color: textColor,
        background: shape === 'underline' || shape === 'plain' ? 'transparent' : backgroundColor,
        borderRadius,
        borderStyle: 'solid',
        borderWidth: shape === 'underline' ? '0 0 2px 0' : shape === 'plain' ? 0 : 1,
        textAlign: style?.textAlign || 'left',
        justifyContent:
          style?.textAlign === 'center' ? 'center' : style?.textAlign === 'right' ? 'flex-end' : 'flex-start'
      };
    },
    [activeTheme, doc.settings.defaultShape, rootNodeIds]
  );

  const selectedEffectiveFontFamilies = selectedNodes.map(node => node.style?.fontFamily || DEFAULT_FONT_FAMILY);
  const selectedFontFamilyMixed = hasMixedValues(selectedEffectiveFontFamilies);
  const selectedFontFamily = sameValues(selectedEffectiveFontFamilies);
  const selectedEffectiveFontSizes = selectedNodes.map(node => node.style?.fontSize || DEFAULT_FONT_SIZE);
  const selectedFontSizeMixed = hasMixedValues(selectedEffectiveFontSizes);
  const selectedFontSize = sameValues(selectedEffectiveFontSizes);
  const selectedEffectiveTextColors = selectedNodes.map(node =>
    node.style?.textColor || (rootNodeIds.has(node.id) ? activeTheme.rootText : activeTheme.nodeText)
  );
  const selectedTextColorMixed = new Set(selectedEffectiveTextColors).size > 1;
  const selectedTextColor =
    selectedEffectiveTextColors.length > 0 && !selectedTextColorMixed ? selectedEffectiveTextColors[0] : '';
  const selectedEffectiveBackgroundColors = selectedNodes.map(node =>
    node.style?.backgroundColor || (rootNodeIds.has(node.id) ? activeTheme.rootBg : activeTheme.nodeBg)
  );
  const selectedBackgroundColorMixed = new Set(selectedEffectiveBackgroundColors).size > 1;
  const selectedBackgroundColor =
    selectedEffectiveBackgroundColors.length > 0 && !selectedBackgroundColorMixed
      ? selectedEffectiveBackgroundColors[0]
      : '';
  const selectedEffectiveTextAligns = selectedNodes.map(node => node.style?.textAlign || 'left');
  const selectedTextAlign = sameValues(selectedEffectiveTextAligns);
  const selectedEffectiveShapes = selectedNodes.map(node =>
    node.style?.shape || (rootNodeIds.has(node.id) ? 'rounded' : doc.settings.defaultShape)
  );
  const selectedShapeMixed = hasMixedValues(selectedEffectiveShapes);
  const selectedShape = sameValues(selectedEffectiveShapes);
  const selectedEffectiveEdgeStyles = selectedStyleEdges.map(edge =>
    effectiveEdgeStyle(edge, doc.settings.defaultEdgeStyle)
  );
  const selectedEffectiveEdgeWidths = selectedEffectiveEdgeStyles.map(style => style.width);
  const selectedEdgeWidthMixed = hasMixedValues(selectedEffectiveEdgeWidths);
  const selectedEdgeWidth = sameValues(selectedEffectiveEdgeWidths);
  const selectedEffectiveEdgeLineTypes = selectedEffectiveEdgeStyles.map(style => style.lineType);
  const selectedEdgeLineTypeMixed = hasMixedValues(selectedEffectiveEdgeLineTypes);
  const selectedEdgeLineType = sameValues(selectedEffectiveEdgeLineTypes);
  const selectedEffectiveEdgeColors = selectedEffectiveEdgeStyles.map(style => style.color);
  const selectedEdgeColorMixed = new Set(selectedEffectiveEdgeColors).size > 1;
  const selectedEdgeColor =
    selectedEffectiveEdgeColors.length > 0 && !selectedEdgeColorMixed ? selectedEffectiveEdgeColors[0] : '';
  const isAnyBold = selectedNodes.some(node => node.style?.bold === true);
  const isAllBold = selectedNodes.length > 0 && selectedNodes.every(node => node.style?.bold === true);
  const isAnyItalic = selectedNodes.some(node => node.style?.italic === true);
  const isAllItalic = selectedNodes.length > 0 && selectedNodes.every(node => node.style?.italic === true);
  const isAnyUnderline = selectedNodes.some(node => node.style?.underline === true);
  const isAllUnderline = selectedNodes.length > 0 && selectedNodes.every(node => node.style?.underline === true);
  const hasMixedBold = isAnyBold && !isAllBold;
  const hasMixedItalic = isAnyItalic && !isAllItalic;
  const hasMixedUnderline = isAnyUnderline && !isAllUnderline;
  const hasNodeSelection = selectedNodeIds.length > 0;
  const tagNameById = React.useMemo(
    () => new Map(doc.settings.tags.map(tag => [tag.id, tag.name])),
    [doc.settings.tags]
  );

  const renderColorDropdown = (
    label: string,
    value: string | '',
    fallback: string,
    mixed: boolean,
    onSelect: (color: string) => void
  ) => {
    const displayColor = value || fallback;
    const isMixed = mixed;
    return (
      <div className="toolbar-field">
        <span>{label}</span>
        <details className="color-dropdown">
          <summary aria-label={label}>
            <span
              className={isMixed ? 'color-preview color-preview-mixed' : 'color-preview'}
              style={isMixed ? undefined : { backgroundColor: displayColor }}
            />
            <span className="color-dropdown-label">{isMixed ? 'Mixed' : displayColor.toUpperCase()}</span>
          </summary>
          <div className="color-swatch-grid" role="group" aria-label={`${label} options`}>
            {COLOR_SWATCHES.map(color => {
              const active = !isMixed && displayColor.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={color}
                  type="button"
                  className={active ? 'color-swatch color-swatch-active' : 'color-swatch'}
                  style={{ backgroundColor: color }}
                  aria-label={`${label} ${color}`}
                  onClick={event => {
                    onSelect(color);
                    event.currentTarget.closest('details')?.removeAttribute('open');
                  }}
                />
              );
            })}
          </div>
        </details>
      </div>
    );
  };

  const renderEdgeStyleControls = (
    title: string,
    edgeCount: number,
    widthValue: number | '',
    widthMixed: boolean,
    lineTypeValue: EdgeLineType | '',
    lineTypeMixed: boolean,
    colorValue: string | '',
    colorMixed: boolean,
    fallback: Required<EdgeStyle>,
    onPatch: (patch: EdgeStyle) => void
  ) => (
    <div className="edge-style-controls">
      <div className="toolbar-section-title">
        {title}{edgeCount > 0 ? ` (${edgeCount})` : ''}
      </div>
      <label className="toolbar-field">
        <span>Line Width</span>
        <select
          value={widthMixed ? MIXED_OPTION : String(widthValue || fallback.width)}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            onPatch({ width: Number(event.target.value) });
          }}
        >
          {widthMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {EDGE_WIDTHS.map(width => (
            <option key={width} value={width}>
              {width}px
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Line Type</span>
        <select
          value={lineTypeMixed ? MIXED_OPTION : lineTypeValue || fallback.lineType}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            onPatch({ lineType: event.target.value as EdgeLineType });
          }}
        >
          {lineTypeMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {EDGE_LINE_TYPES.map(lineType => (
            <option key={lineType.value} value={lineType.value}>
              {lineType.label}
            </option>
          ))}
        </select>
      </label>
      {renderColorDropdown('Line Color', colorValue, fallback.color, colorMixed, color => onPatch({ color }))}
    </div>
  );

  const renderMapToolbar = () => (
    <>
      <div className="toolbar-title">Mind Map Style</div>
      <label className="toolbar-field">
        <span>Theme</span>
        <select value={doc.settings.themeId} onChange={event => applyTheme(event.target.value)}>
          {Object.entries(THEMES).map(([id, theme]) => (
            <option key={id} value={id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Layout</span>
        <select
          value={layoutDirection}
          onChange={event => switchLayoutDirection(event.target.value as LayoutDirection)}
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      <label className="toolbar-field">
        <span>Horizontal Gap</span>
        <input
          type="number"
          min={SPACING_MIN}
          max={SPACING_MAX}
          value={doc.settings.spacing.horizontal}
          onChange={event => applySpacing('horizontal', Number(event.target.value))}
        />
      </label>
      <label className="toolbar-field">
        <span>Vertical Gap</span>
        <input
          type="number"
          min={SPACING_MIN}
          max={SPACING_MAX}
          value={doc.settings.spacing.vertical}
          onChange={event => applySpacing('vertical', Number(event.target.value))}
        />
      </label>
      <label className="toolbar-field">
        <span>Default Shape</span>
        <select
          value={doc.settings.defaultShape}
          onChange={event => commitDoc(prev => updateSettings(prev, { defaultShape: event.target.value as NodeShape }))}
        >
          {NODE_SHAPES.map(shape => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </label>
      {renderEdgeStyleControls(
        'Default Line',
        0,
        doc.settings.defaultEdgeStyle.width || 2,
        false,
        doc.settings.defaultEdgeStyle.lineType || 'solid',
        false,
        doc.settings.defaultEdgeStyle.color || activeTheme.edge,
        false,
        {
          width: doc.settings.defaultEdgeStyle.width || 2,
          lineType: doc.settings.defaultEdgeStyle.lineType || 'solid',
          color: doc.settings.defaultEdgeStyle.color || activeTheme.edge
        },
        applyDefaultEdgeStyle
      )}
      <div className="toolbar-button-row">
        <button
          type="button"
          onClick={fitCanvasToView}
          aria-label="Fit"
          title="Fit graph to visible canvas"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={resetSelectedEdgeBend}
          aria-label="Reset Bend"
          title="Reset selected line route"
          disabled={!selectedEdgeId || (!edgeRoutes[selectedEdgeId] && !edgeBends[selectedEdgeId])}
        >
          Reset Bend
        </button>
      </div>
    </>
  );

  const renderNodeToolbar = () => {
    return (
      <>
      <div className="toolbar-title">Node Style</div>
      <div className="toolbar-subtitle">{selectedNodeIds.length} selected</div>
      <label className="toolbar-field">
        <span>Font</span>
        <select
          value={selectedFontFamilyMixed ? MIXED_OPTION : selectedFontFamily || DEFAULT_FONT_FAMILY}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            applySelectedNodeStyle({ fontFamily: event.target.value });
          }}
        >
          {selectedFontFamilyMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {FONT_FAMILIES.map(font => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Size</span>
        <select
          value={selectedFontSizeMixed ? MIXED_OPTION : String(selectedFontSize || DEFAULT_FONT_SIZE)}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            applySelectedNodeStyle({ fontSize: Number(event.target.value) });
          }}
        >
          {selectedFontSizeMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {FONT_SIZES.map(size => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="toolbar-toggle-row">
        <button
          type="button"
          aria-label="Bold"
          title="Bold"
          className={isAllBold ? 'mode-btn-active' : hasMixedBold ? 'mode-btn-mixed' : ''}
          onClick={() => applySelectedNodeStyle({ bold: !isAllBold })}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          title="Italic"
          className={isAllItalic ? 'mode-btn-active' : hasMixedItalic ? 'mode-btn-mixed' : ''}
          onClick={() => applySelectedNodeStyle({ italic: !isAllItalic })}
        >
          I
        </button>
        <button
          type="button"
          aria-label="Underline"
          title="Underline"
          className={isAllUnderline ? 'mode-btn-active' : hasMixedUnderline ? 'mode-btn-mixed' : ''}
          onClick={() => applySelectedNodeStyle({ underline: !isAllUnderline })}
        >
          U
        </button>
      </div>
      <div className="toolbar-toggle-row">
        {(['left', 'center', 'right'] as TextAlign[]).map(align => (
          <button
            key={align}
            type="button"
            aria-label={align === 'left' ? 'Align Left' : align === 'center' ? 'Align Center' : 'Align Right'}
            title={align === 'left' ? 'Align Left' : align === 'center' ? 'Align Center' : 'Align Right'}
            className={selectedTextAlign === align ? 'mode-btn-active' : ''}
            onClick={() => applySelectedNodeStyle({ textAlign: align })}
          >
            {align[0].toUpperCase()}
          </button>
        ))}
      </div>
      {renderColorDropdown('Text Color', selectedTextColor, '#0f172a', selectedTextColorMixed, color => applySelectedNodeStyle({ textColor: color }))}
      {renderColorDropdown('Node Color', selectedBackgroundColor, '#ffffff', selectedBackgroundColorMixed, color => applySelectedNodeStyle({ backgroundColor: color }))}
      <label className="toolbar-field">
        <span>Shape</span>
        <select
          value={selectedShapeMixed ? MIXED_OPTION : selectedShape || doc.settings.defaultShape}
          onChange={event => {
            if (event.target.value === MIXED_OPTION) return;
            applySelectedNodeStyle({ shape: event.target.value as NodeShape });
          }}
        >
          {selectedShapeMixed ? (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          ) : null}
          {NODE_SHAPES.map(shape => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </label>
      {selectedStyleEdges.length > 0
        ? renderEdgeStyleControls(
            'Related Lines',
            selectedStyleEdges.length,
            selectedEdgeWidth,
            selectedEdgeWidthMixed,
            selectedEdgeLineType,
            selectedEdgeLineTypeMixed,
            selectedEdgeColor,
            selectedEdgeColorMixed,
            {
              width: doc.settings.defaultEdgeStyle.width || 2,
              lineType: doc.settings.defaultEdgeStyle.lineType || 'solid',
              color: doc.settings.defaultEdgeStyle.color || activeTheme.edge
            },
            applySelectedEdgeStyle
          )
        : null}
      <div className="tag-list">
        <div className="tag-list-create">
          <span>Tag Color</span>
          <details className="color-dropdown tag-color-picker">
            <summary aria-label="New tag color">
              <span className="color-preview" style={{ backgroundColor: newTagColor }} />
              <span className="color-dropdown-label">{newTagColor.toUpperCase()}</span>
            </summary>
            <div className="color-swatch-grid" role="group" aria-label="New tag color options">
              {COLOR_SWATCHES.map(color => (
                <button
                  key={color}
                  type="button"
                  className={
                    newTagColor.toLowerCase() === color.toLowerCase() ? 'color-swatch color-swatch-active' : 'color-swatch'
                  }
                  style={{ backgroundColor: color }}
                  aria-label={`New tag color ${color}`}
                  onClick={event => {
                    setNewTagColor(color);
                    event.currentTarget.closest('details')?.removeAttribute('open');
                  }}
                />
              ))}
            </div>
          </details>
          <button type="button" aria-label="Add tag" title="Add tag" onClick={addCustomTag}>
            +
          </button>
        </div>
        {doc.settings.tags.map(tag => (
          <div key={tag.id} className="tag-row">
            <button
              type="button"
              className="tag-color-button"
              aria-label={`Apply tag ${tag.name}`}
              title={`Apply tag ${tag.name}`}
              style={{ backgroundColor: tag.color }}
              onClick={() => applySelectedNodeStyle({ tagId: tag.id })}
            />
            <input value={tag.name} onChange={event => renameTag(tag, event.target.value)} />
            <button type="button" aria-label={`Delete tag ${tag.name}`} onClick={() => removeTagById(tag.id)}>
              x
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={clearSelectedNodeStyle}>
        Reset Node Style
      </button>
      </>
    );
  };

  const renderEdgeToolbar = () => (
    <>
      <div className="toolbar-title">Line Style</div>
      <label className="toolbar-field">
        <span>Layout</span>
        <select
          aria-label="Layout"
          value={layoutDirection}
          onChange={event => switchLayoutDirection(event.target.value as LayoutDirection)}
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      {renderEdgeStyleControls(
        'Selected Line',
        selectedStyleEdges.length,
        selectedEdgeWidth,
        selectedEdgeWidthMixed,
        selectedEdgeLineType,
        selectedEdgeLineTypeMixed,
        selectedEdgeColor,
        selectedEdgeColorMixed,
        {
          width: doc.settings.defaultEdgeStyle.width || 2,
          lineType: doc.settings.defaultEdgeStyle.lineType || 'solid',
          color: doc.settings.defaultEdgeStyle.color || activeTheme.edge
        },
        applySelectedEdgeStyle
      )}
      <div className="toolbar-button-row">
        <button
          type="button"
          onClick={resetSelectedEdgeBend}
          aria-label="Reset Bend"
          title="Reset selected line route"
          disabled={!selectedEdgeId || (!edgeRoutes[selectedEdgeId] && !edgeBends[selectedEdgeId])}
        >
          Reset Bend
        </button>
      </div>
    </>
  );

  const renderOutlineNodes = (items: OutlineTreeNode[], depth = 0): React.ReactNode =>
    items.map(item => {
      const hasChildren = item.children.length > 0;
      const collapsed = collapsedOutlineNodeIds.has(item.node.id);
      const selected = selectedNodeIdSet.has(item.node.id);
      const label = item.node.label.trim() || 'Untitled Node';
      const tag = item.node.style?.tagId ? tagById.get(item.node.style.tagId) : undefined;
      const displayLabel = `${label}${tag ? ` [${tag.name}]` : ''}`;
      const checklistTargets = outlineChecklistTargetsByNodeId.get(item.node.id) || [];
      const checkedTargetCount = checklistTargets.filter(isChecklistNodeChecked).length;
      const canCheck = checklistTargets.length > 0;
      const checked = canCheck && checkedTargetCount === checklistTargets.length;
      const indeterminate = canCheck && checkedTargetCount > 0 && checkedTargetCount < checklistTargets.length;
      const nodeButtonClassName = [
        'outline-node-button',
        selected ? 'outline-node-selected' : '',
        checked ? 'outline-node-complete' : ''
      ]
        .filter(Boolean)
        .join(' ');

      return (
        <React.Fragment key={item.node.id}>
          <div
            className={selected ? 'outline-row outline-row-selected' : 'outline-row'}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            <button
              type="button"
              className="outline-disclosure"
              data-testid={`outline-toggle-${item.node.id}`}
              disabled={!hasChildren}
              onClick={() => toggleOutlineNode(item.node.id)}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {hasChildren ? (collapsed ? '▸' : '▾') : ''}
            </button>
            {canCheck ? (
              <input
                ref={input => {
                  if (input) input.indeterminate = indeterminate;
                }}
                type="checkbox"
                className="outline-check"
                data-testid={`outline-check-${item.node.id}`}
                checked={checked}
                onChange={event => toggleChecklistNodes(checklistTargets, event.currentTarget.checked)}
                onClick={event => event.stopPropagation()}
                title={checked ? 'Mark related tasks not done' : 'Mark related tasks done'}
                aria-label={`${checked ? 'Mark related tasks not done' : 'Mark related tasks done'}: ${displayLabel}`}
              />
            ) : (
              <span className="outline-check-placeholder" aria-hidden="true" />
            )}
            <button
              type="button"
              className={nodeButtonClassName}
              data-testid={`outline-node-${item.node.id}`}
              onClick={() => selectOutlineNode(item.node.id)}
              title={displayLabel}
            >
              {displayLabel}
            </button>
          </div>
          {hasChildren && !collapsed ? renderOutlineNodes(item.children, depth + 1) : null}
        </React.Fragment>
      );
    });

  const renderTaskTable = () => (
    <div className="task-table-scroll">
      {taskTableRows.length === 0 ? (
        <p className="outline-empty">Add tags to nodes to create task rows.</p>
      ) : (
        <table className="task-table">
          <colgroup>
            <col className="task-col-task" />
            <col className="task-col-category" />
            <col className="task-col-priority" />
            <col className="task-col-progress" />
            <col className="task-col-assignee" />
            <col className="task-col-start" />
            <col className="task-col-due" />
            <col className="task-col-tag" />
            <col className="task-col-notes" />
          </colgroup>
          <thead>
            <tr>
              {TASK_TABLE_COLUMNS.map(column => {
                const active = taskTableSort?.key === column.key;
                const direction = active ? taskTableSort.direction : undefined;
                return (
                  <th
                    key={column.key}
                    aria-sort={
                      active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="task-sort-button"
                      data-testid={`task-sort-${column.key}`}
                      onClick={() => toggleTaskTableSort(column.key)}
                    >
                      <span>{column.label}</span>
                      <span className={active ? 'task-sort-indicator task-sort-indicator-active' : 'task-sort-indicator'}>
                        {active ? (direction === 'asc' ? '^' : 'v') : ''}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {taskTableRows.map(row => {
              const task = row.node.task;
              const label = getTaskNodeLabel(row.node);

              return (
                <tr key={row.node.id}>
                  <td>
                    <button type="button" className="task-node-link" onClick={() => selectOutlineNode(row.node.id)}>
                      {label}
                    </button>
                  </td>
                  <td className="task-readonly-cell">{row.category || '-'}</td>
                  <td>
                    <select
                      value={task?.priority || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, {
                          priority: (event.currentTarget.value || 'normal') as TaskPriority
                        })
                      }
                    >
                      <option value="">-</option>
                      {TASK_PRIORITIES.map(priority => (
                        <option key={priority} value={priority}>
                          {TASK_PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="task-progress-input"
                      type="number"
                      min={0}
                      max={100}
                      value={task?.progress ?? ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, {
                          progress:
                            event.currentTarget.value === ''
                              ? 0
                              : Math.max(0, Math.min(100, Number(event.currentTarget.value)))
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={task?.assignee || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, { assignee: event.currentTarget.value || undefined })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={task?.startDate || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, { startDate: event.currentTarget.value || undefined })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={task?.dueDate || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, { dueDate: event.currentTarget.value || undefined })
                      }
                    />
                  </td>
                  <td className="task-readonly-cell">{row.tagName || '-'}</td>
                  <td>
                    <input
                      className="task-notes-input"
                      value={task?.note || ''}
                      onKeyDown={event => event.stopPropagation()}
                      onChange={event =>
                        updateTaskTableField(row.node.id, { note: event.currentTarget.value || undefined })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  const sidePanelVisible = outlineVisible || taskTableVisible;
  const workspaceClassName = [
    'canvas-workspace',
    taskTableVisible ? 'canvas-workspace-task-visible' : outlineVisible ? 'canvas-workspace-outline-visible' : '',
    taskTableVisible && taskTableExpanded ? 'canvas-workspace-task-expanded' : '',
    activeTab.toolbarVisible ? 'canvas-workspace-toolbar-visible' : ''
  ]
    .filter(Boolean)
    .join(' ');
  const workspaceStyle = {
    ['--side-panel-width' as string]: `${sidePanelWidth}px`
  } as React.CSSProperties;

  return (
    <main className="app">
      <header className="tabs-header">
        <div className="tabs-strip">
          {tabs.map(tab => {
            const active = tab.id === activeTab.id;
            const label = tab.currentFilePath ? basename(tab.currentFilePath) : tab.title;
            return (
              <div key={tab.id} className={active ? 'tab-item tab-item-active' : 'tab-item'}>
                <button type="button" className="tab-switch" onClick={() => switchTab(tab.id)}>
                  {label}
                  {tab.isDirty ? <span className="tab-dirty-dot" /> : null}
                </button>
                {tabs.length > 1 ? (
                  <button type="button" className="tab-close" onClick={() => closeTab(tab.id)}>
                    x
                  </button>
                ) : null}
              </div>
            );
          })}
          <button type="button" className="tab-add" onClick={newTab}>
            +
          </button>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="outline-toggle-btn"
            data-testid="outline-toggle"
            onClick={() => {
              setTaskTableVisible(false);
              setTaskTableExpanded(false);
              setOutlineVisible(prev => !prev);
            }}
            title={outlineVisible ? 'Hide outline' : 'Show outline'}
          >
            {outlineVisible ? '☰' : '☷'}
          </button>
          <button
            type="button"
            className="task-toggle-btn"
            data-testid="task-toggle"
            onClick={() => {
              setOutlineVisible(false);
              const nextVisible = !taskTableVisible;
              setTaskTableVisible(nextVisible);
              if (!nextVisible) {
                setTaskTableExpanded(false);
              }
            }}
            title={taskTableVisible ? 'Hide tasks' : 'Show tasks'}
          >
            Task
          </button>
          <button
            type="button"
            className="toolbar-toggle-btn"
            onClick={() => setToolbarVisible(!activeTab.toolbarVisible)}
            title={activeTab.toolbarVisible ? 'Hide toolbar' : 'Show toolbar'}
          >
            {activeTab.toolbarVisible ? '▧' : '▨'}
          </button>
        </div>
      </header>

      {fileMessage !== 'Ready' ? (
        <div
          className={fileMessage.includes('failed') || fileMessage.includes('blocked') ? 'file-status file-status-error' : 'file-status'}
          data-testid="file-status"
          role="status"
        >
          {fileMessage}
        </div>
      ) : null}

      <section className="panel canvas-panel">
        <div className={workspaceClassName} style={workspaceStyle}>
          {sidePanelVisible ? (
            taskTableVisible ? (
              <aside
                className={taskTableExpanded ? 'outline-panel task-panel task-panel-expanded' : 'outline-panel task-panel'}
                data-testid="task-panel"
              >
                <div className="outline-panel-header">
                  <span>Task</span>
                  <div className="outline-panel-actions">
                    <button
                      type="button"
                      className="outline-panel-action"
                      data-testid="task-expand-toggle"
                      onClick={() => setTaskTableExpanded(prev => !prev)}
                      title={taskTableExpanded ? 'Collapse task table' : 'Expand task table'}
                      aria-label={taskTableExpanded ? 'Collapse task table' : 'Expand task table'}
                    >
                      {taskTableExpanded ? 'Collapse' : 'Expand'}
                    </button>
                    <button
                      type="button"
                      data-testid="task-hide"
                      onClick={() => {
                        setTaskTableExpanded(false);
                        setTaskTableVisible(false);
                      }}
                      title="Hide tasks"
                    >
                      x
                    </button>
                  </div>
                </div>
                {renderTaskTable()}
              </aside>
            ) : (
              <aside className="outline-panel" data-testid="outline-panel">
                <div className="outline-panel-header">
                  <span>Checklist</span>
                  <button type="button" data-testid="outline-hide" onClick={() => setOutlineVisible(false)} title="Hide outline">
                    x
                  </button>
                </div>
                <div className="outline-tree">
                  {outlineTree.length > 0 ? renderOutlineNodes(outlineTree) : <p className="outline-empty">No nodes</p>}
                </div>
              </aside>
            )
          ) : null}
          {sidePanelVisible ? (
            <div
              className={sidePanelResizing ? 'panel-resizer panel-resizer-active' : 'panel-resizer'}
              role="separator"
              aria-orientation="vertical"
              aria-label={taskTableVisible ? 'Resize task panel' : 'Resize checklist panel'}
              aria-valuemin={SIDE_PANEL_MIN_WIDTH}
              aria-valuemax={SIDE_PANEL_MAX_WIDTH}
              aria-valuenow={sidePanelWidth}
              tabIndex={0}
              data-testid="side-panel-resizer"
              onPointerDown={onSidePanelResizePointerDown}
              onPointerMove={onSidePanelResizePointerMove}
              onPointerUp={finishSidePanelResize}
              onPointerCancel={finishSidePanelResize}
              onKeyDown={onSidePanelResizeKeyDown}
            />
          ) : null}
          <div className="canvas-main">
            <h2>
              Flow Canvas ({layoutDirection === 'horizontal' ? 'Horizontal' : 'Vertical'} Auto Layout)
            </h2>
            <div
              ref={canvasRef}
              className="canvas"
              data-testid="canvas-viewport"
              style={{ background: activeTheme.canvas }}
            >
              <div
                ref={canvasSurfaceRef}
                className={isLiveCanvasInteraction ? 'canvas-surface' : 'canvas-surface canvas-surface-animated'}
                data-testid="canvas-surface"
                style={{ width: canvasSize.width, height: canvasSize.height, zoom: canvasZoom }}
                onPointerDown={onCanvasPointerDown}
                onMouseDownCapture={onCanvasMouseDownCapture}
                onMouseUpCapture={onCanvasMouseUpCapture}
                onWheel={onCanvasWheel}
                onContextMenu={event => event.preventDefault()}
              >
                <svg
                  className="edge-layer"
                  aria-label="edge-layer"
                  style={{ width: canvasSize.width, height: canvasSize.height }}
                  onPointerDown={onCanvasPointerDown}
                >
                  {doc.edges.map(edge => {
                    const fromPos = renderedPositionMap.get(edge.from);
                    const toPos = renderedPositionMap.get(edge.to);
                    if (!fromPos || !toPos) return null;
                    const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                    const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
                    const lane = edgeLaneMap.get(edge.id) || 0;
                    const forceBend = edgeForceBendMap.get(edge.id) || false;
                    const selected = edge.id === selectedEdgeId;
                    const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
                    const edgeStyle = effectiveEdgeStyle(edge, doc.settings.defaultEdgeStyle);
                    const strokeDasharray = edgeStrokeDasharray(edgeStyle.lineType, edgeStyle.width);
                    return (
                      <path
                        key={edge.id}
                        data-testid={`edge-path-${edge.id}`}
                        data-edge-id={edge.id}
                        d={edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, route)}
                        className={selected ? 'edge-path edge-path-selected' : 'edge-path'}
                        style={{
                          stroke: edgeStyle.color,
                          strokeWidth: selected ? edgeStyle.width + 1 : edgeStyle.width,
                          strokeDasharray
                        }}
                        onPointerDown={event => {
                          startEdgeSegmentDrag(event);
                        }}
                        onClick={event => {
                          if (suppressNextEdgeClickRef.current) {
                            event.preventDefault();
                            event.stopPropagation();
                            suppressNextEdgeClickRef.current = false;
                            return;
                          }
                          const point = getSvgContentPoint(event.currentTarget.ownerSVGElement, event.clientX, event.clientY);
                          const edgeHit = point ? findEdgeHitAtPoint(point, event.currentTarget.dataset.edgeId) : null;
                          setSelectedEdgeId(edgeHit?.edgeId || edge.id);
                          setSelectedRouteControl(null);
                          setSelectedNodeIds([]);
                        }}
                      />
                    );
                  })}
                  {connectDrag ? (
                    <path
                      className="edge-path edge-path-preview"
                      d={`M ${connectDrag.start.x} ${connectDrag.start.y} Q ${(connectDrag.start.x + connectDrag.current.x) / 2} ${(connectDrag.start.y + connectDrag.current.y) / 2} ${connectDrag.current.x} ${connectDrag.current.y}`}
                    />
                  ) : null}
                  {edgeBendDrag
                    ? doc.edges.map(edge => {
                        if (edge.id !== edgeBendDrag.edgeId) return null;
                        const fromPos = renderedPositionMap.get(edge.from);
                        const toPos = renderedPositionMap.get(edge.to);
                        if (!fromPos || !toPos) return null;
                        const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                        const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                        const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
                        const lane = edgeLaneMap.get(edge.id) || 0;
                        const forceBend = edgeForceBendMap.get(edge.id) || false;
                        const route =
                          edgeRoutes[edge.id] ||
                          routeFromBend(edgeBends[edge.id]) ||
                          autoEdgeRouteMap.get(edge.id);
                        return (
                          <path
                            key={`route-preview-${edge.id}`}
                            data-testid="edge-route-drag-preview"
                            className="edge-route-drag-preview"
                            d={edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, route)}
                          />
                        );
                      })
                    : null}
                  {!edgeBendDrag && selectedEdgeId
                    ? doc.edges.map(edge => {
                        if (edge.id !== selectedEdgeId) return null;
                        const fromPos = renderedPositionMap.get(edge.from);
                        const toPos = renderedPositionMap.get(edge.to);
                        if (!fromPos || !toPos) return null;
                        const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                        const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                        const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
                        const lane = edgeLaneMap.get(edge.id) || 0;
                        const forceBend = edgeForceBendMap.get(edge.id) || false;
                        const isForwardAlignedEdge =
                          layoutDirection === 'horizontal'
                            ? endpoints.to.x >= endpoints.from.x && Math.abs(endpoints.to.y - endpoints.from.y) <= 2
                            : endpoints.to.y >= endpoints.from.y && Math.abs(endpoints.to.x - endpoints.from.x) <= 2;
                        const automaticManualRoute =
                          layoutEdgeAnalysis.layoutEdgeIds.has(edge.id) || isForwardAlignedEdge
                            ? undefined
                            : autoEdgeRouteMap.get(edge.id);
                        const route =
                          edgeRoutes[edge.id] ||
                          routeFromBend(edgeBends[edge.id]) ||
                          automaticManualRoute;
                        if (!route || route.points.length === 0) return null;
                        return (
                          <path
                            key={`route-guide-${edge.id}`}
                            data-testid="edge-route-guide"
                            className="edge-route-guide"
                            d={edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, route)}
                          />
                        );
                      })
                    : null}
                  {doc.edges.map(edge => {
                    if (edge.id !== selectedEdgeId) return null;
                    const fromPos = renderedPositionMap.get(edge.from);
                    const toPos = renderedPositionMap.get(edge.to);
                    if (!fromPos || !toPos) return null;
                    const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                    const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
                    const isForwardAlignedEdge =
                      layoutDirection === 'horizontal'
                        ? endpoints.to.x >= endpoints.from.x && Math.abs(endpoints.to.y - endpoints.from.y) <= 2
                        : endpoints.to.y >= endpoints.from.y && Math.abs(endpoints.to.x - endpoints.from.x) <= 2;
                    const automaticManualRoute =
                      layoutEdgeAnalysis.layoutEdgeIds.has(edge.id) || isForwardAlignedEdge
                        ? undefined
                        : autoEdgeRouteMap.get(edge.id);
                    const route =
                      edgeRoutes[edge.id] ||
                      routeFromBend(edgeBends[edge.id]) ||
                      automaticManualRoute ||
                      routeFromBend(edgeMidpoint(endpoints.from, endpoints.to));
                    const point = route.points.length === 1
                      ? route.points[0]
                      : routeControlPoint(endpoints.from, endpoints.to, route);
                    const pointIndex = 0;
                    return (
                      <g key={`bend-${edge.id}`}>
                        <circle
                          className="edge-bend-hit-area"
                          cx={point.x}
                          cy={point.y}
                          r={9}
                          onPointerDown={event => startEdgeBendDrag(event, edge.id, pointIndex)}
                          onContextMenu={event => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        />
                        <circle
                          data-testid={`edge-route-point-${pointIndex}`}
                          className={
                            selectedRouteControl?.edgeId === edge.id && selectedRouteControl.pointIndex === pointIndex
                              ? 'edge-bend-handle edge-bend-handle-selected'
                              : 'edge-bend-handle'
                          }
                          cx={point.x}
                          cy={point.y}
                          r={7}
                          onPointerDown={event => startEdgeBendDrag(event, edge.id, pointIndex)}
                          onContextMenu={event => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        />
                      </g>
                    );
                  })}
                </svg>

                {marquee ? (
                  <div
                    className="marquee-selection"
                    style={{
                      left: Math.min(marquee.startX, marquee.currentX),
                      top: Math.min(marquee.startY, marquee.currentY),
                      width: Math.abs(marquee.currentX - marquee.startX),
                      height: Math.abs(marquee.currentY - marquee.startY)
                    }}
                  />
                ) : null}
                {dragInsertPreview ? (
                  <div
                    className="drag-insert-preview"
                    style={{
                      left: dragInsertPreview.left,
                      top: dragInsertPreview.top,
                      width: dragInsertPreview.width,
                      height: dragInsertPreview.height
                    }}
                  />
                ) : null}

                {layout.positions.map(pos => {
                  const node = doc.nodes.find(item => item.id === pos.id);
                  if (!node) return null;
                  const rendered = renderedPositionMap.get(node.id) || pos;
                  const nodeSize = nodeSizeMap[node.id] || DEFAULT_NODE_SIZE;
                  const selected = selectedNodeIds.includes(node.id);
                  const editing = editingNodeId === node.id;
                  const connectHandleVisible = Boolean(connectDrag);
                  const nodeTag = node.style?.tagId
                    ? doc.settings.tags.find(tag => tag.id === node.style?.tagId)
                    : undefined;
                  return (
                    <button
                      key={node.id}
                      className={[
                        'flow-node',
                        selected ? 'flow-node-selected' : '',
                        connectHandleVisible ? 'flow-node-connect-visible' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      data-drop-target={
                        dropParentTargetId === node.id || connectDrag?.hoverTargetNodeId === node.id
                          ? 'true'
                          : undefined
                      }
                      data-tag-name={nodeTag?.name || undefined}
                      style={{
                        left: rendered.x,
                        top: rendered.y,
                        width: nodeSize.width,
                        height: nodeSize.height,
                        ...getNodeVisualStyle(node.id, node.style)
                      }}
                      data-testid={`node-${node.id}`}
                      type="button"
                      onPointerDown={event => onNodePointerDown(event, node.id)}
                      onMouseUp={event => onNodeMouseUp(event, node.id)}
                      onContextMenu={onNodeContextMenu}
                      onDoubleClick={() => startEditingNode(node.id)}
                    >
                      {editing ? (
                        <input
                          className="node-label-input"
                          value={editingLabel}
                          onInput={event => updateEditingLabel(event.currentTarget.value)}
                          onCompositionUpdate={event => updateEditingLabel(event.currentTarget.value)}
                          onCompositionEnd={event => updateEditingLabel(event.currentTarget.value)}
                          onChange={event => updateEditingLabel(event.currentTarget.value)}
                          onBlur={commitEditingNode}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitEditingNode();
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              editingNodeIdRef.current = null;
                              editingLabelRef.current = '';
                              setEditingNodeId(null);
                              setEditingLabel('');
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <div className="node-label">{node.label}</div>
                      )}
                      {nodeTag ? (
                        <span
                          className="node-tag-marker"
                          style={{ backgroundColor: nodeTag.color }}
                          aria-label={nodeTag.name}
                        />
                      ) : null}
                      <span
                        className={
                          layoutDirection === 'horizontal'
                            ? 'node-connect-handle-front'
                            : 'node-connect-handle-front node-connect-handle-front-vertical'
                        }
                        title="Drag from input side"
                        onPointerDown={event => startConnectDrag(event, node.id, FRONT_HANDLE_CONNECT_ANCHORS)}
                        onContextMenu={event => event.preventDefault()}
                      />
                      <span
                        className={
                          layoutDirection === 'horizontal'
                            ? 'node-connect-handle'
                            : 'node-connect-handle node-connect-handle-vertical'
                        }
                        title="Drag to connect"
                        onPointerDown={event => startConnectDrag(event, node.id)}
                        onContextMenu={event => event.preventDefault()}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {activeTab.toolbarVisible ? (
            <aside className="right-toolbar-rail">
              <div className="right-toolbar right-toolbar-vertical">
                {hasNodeSelection ? renderNodeToolbar() : selectedEdgeId ? renderEdgeToolbar() : renderMapToolbar()}
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </main>
  );
}
