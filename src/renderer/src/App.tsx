import React from 'react';
import {
  addEdge,
  addNode,
  createEmptyDoc,
  deserialize,
  deleteTag,
  reparentNode,
  removeEdge,
  removeNodes,
  resetNodeStyle,
  updateNodeLabel,
  updateNodeStyle,
  updateSettings,
  upsertTag,
  validateEdge,
  type FlowEdge,
  type FlowTag,
  type FlowDoc,
  type NodeId,
  type NodeShape,
  type NodeStyle,
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
const SPACING_MIN = 16;
const SPACING_MAX = 320;
const FONT_FAMILIES = ['Roboto', 'Segoe UI', 'Arial', 'Microsoft JhengHei', 'Noto Sans TC'];
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 32, 48, 64];
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
type NodeOffsetsByDirection = Record<LayoutDirection, NodeOffsetMap>;
type DragState = {
  nodeIds: NodeId[];
  anchorNodeId: NodeId;
  startX: number;
  startY: number;
  startOffsets: Record<NodeId, NodeOffset>;
};
type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
type EdgeBend = { x: number; y: number };
type EdgeBendMap = Record<string, EdgeBend>;
type EdgeBendsByDirection = Record<LayoutDirection, EdgeBendMap>;
type EdgeBendDragState = { edgeId: string };
type ConnectDragState = {
  fromNodeId: NodeId;
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
  bend?: EdgeBend;
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
type PersistedUiState = {
  layoutDirection: LayoutDirection;
  nodeOffsetsByDirection: NodeOffsetsByDirection;
  edgeBendsByDirection: EdgeBendsByDirection;
  toolbarVisible: boolean;
};
type PersistedQflowFile = {
  schemaVersion: 1;
  doc: FlowDoc;
  ui?: Partial<PersistedUiState>;
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
  toolbarVisible: boolean;
};

const PNG_FILTER = [{ name: 'PNG Image', extensions: ['png'] }];

function createChildNodeStyle(defaultShape: NodeShape): NodeStyle {
  return {
    ...CHILD_NODE_STYLE,
    shape: defaultShape
  };
}

function emptyOffsetsByDirection(): NodeOffsetsByDirection {
  return { horizontal: {}, vertical: {} };
}

function emptyEdgeBendsByDirection(): EdgeBendsByDirection {
  return { horizontal: {}, vertical: {} };
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
    toolbarVisible: true
  };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeNodeOffsetMap(value: unknown, validNodeIds: Set<NodeId>): NodeOffsetMap {
  if (!value || typeof value !== 'object') return {};
  const result: NodeOffsetMap = {};
  for (const [id, rawOffset] of Object.entries(value as Record<string, unknown>)) {
    if (!validNodeIds.has(id)) continue;
    if (!rawOffset || typeof rawOffset !== 'object') continue;
    const dx = asFiniteNumber((rawOffset as { dx?: unknown }).dx);
    const dy = asFiniteNumber((rawOffset as { dy?: unknown }).dy);
    if (dx === null || dy === null) continue;
    if (dx === 0 && dy === 0) continue;
    result[id] = { dx, dy };
  }
  return result;
}

function sanitizeEdgeBendMap(value: unknown, validEdgeIds: Set<string>): EdgeBendMap {
  if (!value || typeof value !== 'object') return {};
  const result: EdgeBendMap = {};
  for (const [id, rawBend] of Object.entries(value as Record<string, unknown>)) {
    if (!validEdgeIds.has(id)) continue;
    if (!rawBend || typeof rawBend !== 'object') continue;
    const x = asFiniteNumber((rawBend as { x?: unknown }).x);
    const y = asFiniteNumber((rawBend as { y?: unknown }).y);
    if (x === null || y === null) continue;
    result[id] = { x, y };
  }
  return result;
}

function parsePersistedQflow(raw: string): { doc: FlowDoc; ui: PersistedUiState } {
  const parsed = JSON.parse(raw) as unknown;
  const maybeWrapper = parsed as Partial<PersistedQflowFile>;
  const sourceDoc =
    parsed && typeof parsed === 'object' && 'doc' in (parsed as Record<string, unknown>)
      ? maybeWrapper.doc
      : parsed;
  const doc = ensureDocHasNode(deserialize(JSON.stringify(sourceDoc)));
  const validNodeIds = new Set(doc.nodes.map(node => node.id));
  const validEdgeIds = new Set(doc.edges.map(edge => edge.id));
  const rawUi = maybeWrapper?.ui;
  const layoutDirection = rawUi?.layoutDirection === 'vertical' ? 'vertical' : 'horizontal';
  const nodeOffsetsByDirection: NodeOffsetsByDirection = {
    horizontal: sanitizeNodeOffsetMap(rawUi?.nodeOffsetsByDirection?.horizontal, validNodeIds),
    vertical: sanitizeNodeOffsetMap(rawUi?.nodeOffsetsByDirection?.vertical, validNodeIds)
  };
  const rawEdgeBendsByDirection = rawUi?.edgeBendsByDirection;
  const edgeBendsByDirection: EdgeBendsByDirection = {
    horizontal: sanitizeEdgeBendMap(rawEdgeBendsByDirection?.horizontal, validEdgeIds),
    vertical: sanitizeEdgeBendMap(rawEdgeBendsByDirection?.vertical, validEdgeIds)
  };
  const legacyEdgeBends = sanitizeEdgeBendMap((rawUi as { edgeBends?: unknown } | undefined)?.edgeBends, validEdgeIds);
  if (Object.keys(legacyEdgeBends).length > 0) {
    edgeBendsByDirection[layoutDirection] = {
      ...edgeBendsByDirection[layoutDirection],
      ...legacyEdgeBends
    };
  }
  const toolbarVisible = rawUi?.toolbarVisible === false ? false : true;
  return { doc, ui: { layoutDirection, nodeOffsetsByDirection, edgeBendsByDirection, toolbarVisible } };
}

function serializePersistedQflow(tab: TabDocument): string {
  const payload: PersistedQflowFile = {
    schemaVersion: 1,
    doc: tab.history.present,
    ui: {
      layoutDirection: tab.layoutDirection,
      nodeOffsetsByDirection: tab.nodeOffsetsByDirection,
      edgeBendsByDirection: tab.edgeBendsByDirection,
      toolbarVisible: tab.toolbarVisible
    }
  };
  return JSON.stringify(payload, null, 2);
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
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);

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
      if (intersectsX && intersectsY) return true;
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
    if (intersectsX && intersectsY) return true;
  }

  return false;
}

function edgePath(
  from: Point,
  to: Point,
  lane: number,
  direction: LayoutDirection,
  fromSize: NodeSize,
  toSize: NodeSize,
  forceBend = false,
  manualBend?: EdgeBend
): string {
  if (manualBend) {
    const midpoint = edgeMidpoint(from, to);
    const dx = manualBend.x - midpoint.x;
    const dy = manualBend.y - midpoint.y;
    const maxPrimary = Math.max(72, Math.abs(to.x - from.x) * 0.4);
    const maxSecondary = Math.max(84, Math.abs(to.y - from.y) + 36);
    const clampedDx =
      direction === 'horizontal'
        ? clamp(dx, -maxPrimary, maxPrimary)
        : clamp(dx, -maxSecondary, maxSecondary);
    const clampedDy =
      direction === 'horizontal'
        ? clamp(dy, -maxSecondary, maxSecondary)
        : clamp(dy, -maxPrimary, maxPrimary);
    return `M ${from.x} ${from.y} Q ${midpoint.x + clampedDx} ${midpoint.y + clampedDy} ${to.x} ${to.y}`;
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

function edgeMidpoint(from: Point, to: Point): EdgeBend {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function basename(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function analyzeLayoutEdges(doc: FlowDoc): LayoutEdgeAnalysis {
  const nodeIds = new Set(doc.nodes.map(node => node.id));
  const incomingCount = new Map<NodeId, number>();
  const outgoing = new Map<NodeId, FlowEdge[]>();
  for (const node of doc.nodes) {
    incomingCount.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of doc.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge);
  }
  for (const edges of outgoing.values()) {
    edges.sort((a, b) => edgeSeq(a.id) - edgeSeq(b.id));
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

function sameSelectedValue<T>(nodes: Array<{ style?: NodeStyle }>, selector: (style: NodeStyle | undefined) => T | undefined): T | '' {
  if (nodes.length === 0) return '';
  const first = selector(nodes[0].style);
  return nodes.every(node => selector(node.style) === first) ? first || '' : '';
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

function getNodeIdFromEventTarget(target: EventTarget | null | undefined): NodeId | null {
  if (!target || !(target instanceof Element)) return null;
  const nodeEl = target.closest('[data-testid^="node-"]') as HTMLElement | null;
  if (!nodeEl) return null;
  const testId = nodeEl.dataset.testid || nodeEl.getAttribute('data-testid');
  if (!testId || !testId.startsWith('node-')) return null;
  const nodeId = testId.slice(5);
  return nodeId.length > 0 ? nodeId : null;
}

function getNodeIdFromViewportPoint(clientX: number, clientY: number): NodeId | null {
  const el = document.elementFromPoint(clientX, clientY);
  return getNodeIdFromEventTarget(el);
}

function isViewportPointOnConnectHandle(clientX: number, clientY: number, nodeId: NodeId, direction: LayoutDirection) {
  const nodeEl = document.querySelector(`[data-testid="node-${nodeId}"]`);
  if (!(nodeEl instanceof HTMLElement)) return false;
  const rect = nodeEl.getBoundingClientRect();
  if (direction === 'horizontal') {
    return Math.abs(clientX - rect.right) <= 14 && clientY >= rect.top - 8 && clientY <= rect.bottom + 8;
  }
  return Math.abs(clientY - rect.bottom) <= 14 && clientX >= rect.left - 8 && clientX <= rect.right + 8;
}

function getConnectHandleNodeIdFromViewportPoint(clientX: number, clientY: number, direction: LayoutDirection): NodeId | null {
  const nodeEls = Array.from(document.querySelectorAll('[data-testid^="node-"]'));
  for (const nodeEl of nodeEls) {
    if (!(nodeEl instanceof HTMLElement)) continue;
    const testId = nodeEl.dataset.testid || nodeEl.getAttribute('data-testid');
    const nodeId = testId?.replace(/^node-/, '') as NodeId | undefined;
    if (nodeId && isViewportPointOnConnectHandle(clientX, clientY, nodeId, direction)) {
      return nodeId;
    }
  }
  return null;
}

export function App() {
  const [tabs, setTabs] = React.useState<TabDocument[]>([createTabDocument('tab-1', 'Untitled 1')]);
  const [activeTabId, setActiveTabId] = React.useState('tab-1');
  const [tabCounter, setTabCounter] = React.useState(2);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState('');
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<NodeId[]>([]);
  const [copiedSelection, setCopiedSelection] = React.useState<CopiedSelection | null>(null);
  const [editingNodeId, setEditingNodeId] = React.useState<NodeId | null>(null);
  const [editingLabel, setEditingLabel] = React.useState('');
  const [dragState, setDragState] = React.useState<DragState | null>(null);
  const [marquee, setMarquee] = React.useState<MarqueeState | null>(null);
  const [edgeBendDrag, setEdgeBendDrag] = React.useState<EdgeBendDragState | null>(null);
  const [connectDrag, setConnectDrag] = React.useState<ConnectDragState | null>(null);
  const [dropParentTargetId, setDropParentTargetId] = React.useState<NodeId | null>(null);
  const [fileMessage, setFileMessage] = React.useState('Ready');
  const [canvasZoom, setCanvasZoom] = React.useState(1);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const dragDidMoveRef = React.useRef(false);
  const pendingRightConnectFromRef = React.useRef<NodeId | null>(null);
  const connectDragListenersRef = React.useRef<{
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onMouseMove: (event: MouseEvent) => void;
    onMouseUp: (event: MouseEvent) => void;
  } | null>(null);

  const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0];
  const doc = activeTab.history.present;
  const layoutDirection = activeTab.layoutDirection;
  const nodeOffsets = activeTab.nodeOffsetsByDirection[layoutDirection];
  const edgeBends = activeTab.edgeBendsByDirection[layoutDirection];
  const activeTheme = getTheme(doc.settings.themeId);
  const layoutEdgeAnalysis = React.useMemo(() => analyzeLayoutEdges(doc), [doc]);
  const layoutDoc = React.useMemo(
    () => ({ ...doc, edges: layoutEdgeAnalysis.layoutEdges }),
    [doc, layoutEdgeAnalysis.layoutEdges]
  );
  const rootNodeIds = layoutEdgeAnalysis.rootNodeIds;
  const primaryRootNodeId = React.useMemo(
    () => doc.nodes.find(node => rootNodeIds.has(node.id))?.id || '',
    [doc.nodes, rootNodeIds]
  );
  const selectedNodes = React.useMemo(
    () => doc.nodes.filter(node => selectedNodeIds.includes(node.id)),
    [doc.nodes, selectedNodeIds]
  );

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

  const resetTransientUiState = React.useCallback((defaultNodeId?: NodeId) => {
    stopConnectDragListeners();
    setSelectedEdgeId('');
    setSelectedNodeIds(defaultNodeId ? [defaultNodeId] : []);
    setCopiedSelection(null);
    setEditingNodeId(null);
    setEditingLabel('');
    setMarquee(null);
    setDragState(null);
    setEdgeBendDrag(null);
    setConnectDrag(null);
    setDropParentTargetId(null);
  }, [stopConnectDragListeners]);

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
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left + canvas.scrollLeft) / canvasZoom,
        y: (clientY - rect.top + canvas.scrollTop) / canvasZoom
      };
    },
    [canvasZoom]
  );

  const commitDoc = React.useCallback((recipe: (current: FlowDoc) => FlowDoc) => {
    updateActiveTab(tab => {
      const nextDoc = ensureDocHasNode(recipe(tab.history.present));
      return {
        ...tab,
        history: commitHistory(tab.history, nextDoc),
        isDirty: true
      };
    });
    setFileMessage('Edited');
  }, [updateActiveTab]);

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
      toolbarVisible: true
    }));
    setFileMessage('New document');
    resetTransientUiState(nextDoc.nodes[0]?.id);
  }, [resetTransientUiState, tabCounter, updateActiveTab]);

  const openDocument = React.useCallback(async () => {
    try {
      const result = await window.flowmaptool.openDocument();
      if (!result) return;
      const loaded = parsePersistedQflow(result.content);
      const id = `tab-${tabCounter}`;
      setTabs(prev => [
        ...prev,
        {
          ...createTabDocument(id, basename(result.filePath), loaded.doc),
          currentFilePath: result.filePath,
          layoutDirection: loaded.ui.layoutDirection,
          nodeOffsetsByDirection: loaded.ui.nodeOffsetsByDirection,
          edgeBendsByDirection: loaded.ui.edgeBendsByDirection,
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
          content: serializePersistedQflow(activeTab),
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

  const edgeForceBendMap = React.useMemo(() => {
    const map = new Map<string, boolean>();
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getEdgeEndpoints(fromPos, toPos, layoutDirection, fromSize, toSize);
      map.set(
        edge.id,
        !layoutEdgeAnalysis.layoutEdgeIds.has(edge.id) ||
          edgeIntersectsNodeCorridor(endpoints.from, endpoints.to, layoutDirection, edge.from, edge.to, nodeBoxMap)
      );
    }
    return map;
  }, [doc.edges, layoutDirection, layoutEdgeAnalysis.layoutEdgeIds, nodeBoxMap, nodeSizeMap, renderedPositionMap]);

  const edgeLaneMap = React.useMemo(() => {
    const laneByEdgeId = new Map<string, number>();
    const byFrom = new Map<NodeId, { id: string; delta: number; needsBend: boolean }[]>();
    for (const edge of doc.edges) {
      const fromPos = renderedPositionMap.get(edge.from);
      const toPos = renderedPositionMap.get(edge.to);
      if (!fromPos || !toPos) continue;
      const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
      const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
      const endpoints = getEdgeEndpoints(fromPos, toPos, layoutDirection, fromSize, toSize);
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
  }, [doc.edges, edgeForceBendMap, layoutDirection, nodeSizeMap, renderedPositionMap]);

  const tryCreateEdge = React.useCallback(
    (from: NodeId, to: NodeId) => {
      let nextFrom = from;
      let nextTo = to;
      const sameComponentBeforeConnect = new Set(collectConnectedComponent(doc, from)).has(to);
      if (to === primaryRootNodeId && from !== to && !sameComponentBeforeConnect) {
        nextFrom = to;
        nextTo = from;
      }
      const fromComponent = new Set(collectConnectedComponent(doc, nextFrom));
      const mergesTwoComponents = !fromComponent.has(nextTo);
      const mergedComponentNodeIds = mergesTwoComponents
        ? new Set([...fromComponent, ...collectConnectedComponent(doc, nextTo)])
        : null;
      const validation = validateEdge(doc, nextFrom, nextTo);
      if (!validation.ok) {
        if (validation.reason === 'self-edge') setFileMessage('Connect blocked: source and target are the same node');
        if (validation.reason === 'duplicate-edge') setFileMessage('Connect blocked: edge already exists');
        return false;
      }
      const shouldNormalizeAttachedRoot =
        rootNodeIds.has(nextTo) && nextTo !== primaryRootNodeId;
      commitDoc(prev => {
        const withEdge = addEdge(prev, nextFrom, nextTo);
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
      const endpoints = getEdgeEndpoints(fromPos, toPos, layoutDirection, fromSize, toSize);
      const bend = edgeBends[edge.id];
      edges.push({
        id: edge.id,
        from: endpoints.from,
        to: endpoints.to,
        lane: edgeLaneMap.get(edge.id) || 0,
        fromSize,
        toSize,
        forceBend: edgeForceBendMap.get(edge.id) || false,
        ...(bend ? { bend } : {})
      });
    }
    return { nodes, edges };
  }, [doc.edges, doc.nodes, edgeBends, edgeForceBendMap, edgeLaneMap, layoutDirection, nodeSizeMap, renderedPositionMap, rootNodeIds]);

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
        minX = Math.min(minX, edge.from.x, edge.to.x, edge.bend?.x ?? edge.from.x);
        minY = Math.min(minY, edge.from.y, edge.to.y, edge.bend?.y ?? edge.from.y);
        maxX = Math.max(maxX, edge.from.x, edge.to.x, edge.bend?.x ?? edge.to.x);
        maxY = Math.max(maxY, edge.from.y, edge.to.y, edge.bend?.y ?? edge.to.y);
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
          const bend = edge.bend ? shiftPoint(edge.bend) : undefined;
          return `<path d="${edgePath(from, to, edge.lane, layoutDirection, edge.fromSize, edge.toSize, edge.forceBend, bend)}" stroke="${activeTheme.edge}" stroke-width="2" fill="none" stroke-linecap="round" />`;
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
    if (!editingNodeId) return;
    if (!doc.nodes.some(node => node.id === editingNodeId)) {
      setEditingNodeId(null);
      setEditingLabel('');
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
      return {
        ...tab,
        nodeOffsetsByDirection: { horizontal: nextHorizontal, vertical: nextVertical },
        edgeBendsByDirection: {
          horizontal: pruneBends(tab.edgeBendsByDirection.horizontal),
          vertical: pruneBends(tab.edgeBendsByDirection.vertical)
        }
      };
    });
  }, [doc.edges, doc.nodes, updateActiveTab]);

  const deleteSelectedEdge = React.useCallback(() => {
    if (!selectedEdgeId) return;
    commitDoc(prev => removeEdge(prev, selectedEdgeId));
    setSelectedEdgeId('');
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
    setEditingNodeId(nodeId);
    setEditingLabel(clampNodeLabel(node.label));
  }, [doc.nodes]);

  const commitEditingNode = React.useCallback(() => {
    if (!editingNodeId) return;
    const nextLabel = clampNodeLabel(editingLabel).trim();
    commitDoc(prev => updateNodeLabel(prev, editingNodeId, nextLabel));
    setEditingNodeId(null);
    setEditingLabel('');
  }, [commitDoc, editingLabel, editingNodeId]);

  const createLinkedNodeFromSelection = React.useCallback(() => {
    if (selectedNodeIds.length !== 1) return;
    const parentId = selectedNodeIds[0];
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
    setSelectedEdgeId('');
    setEditingNodeId(newNodeId);
    setEditingLabel(newLabel);
  }, [commitDoc, doc.meta.nextNodeSeq, nodeOffsets, selectedNodeIds, setCurrentNodeOffsets]);

  const resetSelectedEdgeBend = React.useCallback(() => {
    if (!selectedEdgeId) return;
    setCurrentEdgeBends(prev => {
      const { [selectedEdgeId]: _removed, ...rest } = prev;
      return rest;
    });
  }, [selectedEdgeId, setCurrentEdgeBends]);

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
    commitDoc(prev => upsertTag(prev, { id, name: 'New Tag', color: '#64748b' }));
  }, [commitDoc, doc.settings.tags]);

  const renameTag = React.useCallback(
    (tag: FlowTag, name: string) => {
      commitDoc(prev => upsertTag(prev, { ...tag, name }));
    },
    [commitDoc]
  );

  const recolorTag = React.useCallback(
    (tag: FlowTag, color: string) => {
      commitDoc(prev => upsertTag(prev, { ...tag, color }));
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
        updateActiveTab(tab => ({ ...tab, history: undoHistory(tab.history), isDirty: true }));
        return;
      }
      if (mod && ((key === 'z' && event.shiftKey) || key === 'y')) {
        event.preventDefault();
        updateActiveTab(tab => ({ ...tab, history: redoHistory(tab.history), isDirty: true }));
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
      if (key === 'tab' && selectedNodeIds.length === 1) {
        event.preventDefault();
        createLinkedNodeFromSelection();
        return;
      }
      if (selectedNodeIds.length > 0 && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (selectedEdgeId) {
          event.preventDefault();
          deleteSelectedEdge();
          return;
        }
        if (selectedNodeIds.length > 0) {
          event.preventDefault();
          deleteSelectedNodes();
          return;
        }
      }
      if (key === ' ' && selectedNodeIds.length === 1) {
        event.preventDefault();
        startEditingNode(selectedNodeIds[0]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    copySelectedNodes,
    createLinkedNodeFromSelection,
    createNewDocument,
    deleteSelectedEdge,
    deleteSelectedNodes,
    openDocument,
    pasteSelectedNodes,
    saveDocument,
    setCanvasZoom,
    selectedEdgeId,
    selectedNodeIds,
    startEditingNode,
    fitCanvasToView,
    updateActiveTab
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
      setCurrentNodeOffsets(prev => {
        let next = { ...prev };
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
            return prev;
          }
        }
        return next;
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
          const nextComponentIds = collectConnectedComponent(nextDoc, anchorRootId);
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
        setCurrentNodeOffsets(prev => {
          const next = { ...prev };
          for (const nodeId of dragState.nodeIds) {
            const startOffset = dragState.startOffsets[nodeId] || { dx: 0, dy: 0 };
            if (startOffset.dx === 0 && startOffset.dy === 0) {
              delete next[nodeId];
            } else {
              next[nodeId] = startOffset;
            }
          }
          return next;
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
  }, [autoPanCanvas, commitDoc, doc, dragState, dropParentTargetId, getCanvasContentPoint, layout.positions, layoutDirection, layoutSpacing, nodeSizeMap, primaryRootNodeId, renderedPositionMap, restoreCurrentNodeOffsets, rootNodeIds, setCurrentNodeOffsets]);

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
      return { ...prev, current: { x, y }, hoverTargetNodeId };
    });
  }, [autoPanCanvas, findNodeAtCanvasPoint, getCanvasContentPoint]);

  const finishConnectDragFromPointer = React.useCallback((event: DragPointerLikeEvent) => {
    stopConnectDragListeners();
    pendingRightConnectFromRef.current = null;
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    const targetFromEvent = getNodeIdFromEventTarget(event.target);
    const targetFromPoint = getNodeIdFromViewportPoint(event.clientX, event.clientY);
    if (!pointer) {
      setConnectDrag(null);
      return;
    }
    const { x, y } = pointer;
    setConnectDrag(prev => {
      if (!prev) return null;
      const targetId = targetFromPoint || prev.hoverTargetNodeId || findNodeAtCanvasPoint(x, y) || targetFromEvent;
      if (targetId && targetId !== prev.fromNodeId) {
        if (tryCreateEdge(prev.fromNodeId, targetId)) {
          setSelectedNodeIds([targetId]);
        }
      }
      return null;
    });
  }, [findNodeAtCanvasPoint, getCanvasContentPoint, stopConnectDragListeners, tryCreateEdge]);

  React.useEffect(() => {
    if (!edgeBendDrag) return;
    const onPointerMove = (event: PointerEvent) => {
      autoPanCanvas(event);
      const pointer = getCanvasContentPoint(event.clientX, event.clientY);
      if (!pointer) return;
      const { x, y } = pointer;
      setCurrentEdgeBends(prev => ({ ...prev, [edgeBendDrag.edgeId]: { x, y } }));
    };
    const onPointerUp = () => setEdgeBendDrag(null);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [autoPanCanvas, edgeBendDrag, getCanvasContentPoint, setCurrentEdgeBends]);

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

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (editingNodeId || connectDrag) return;
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    if (!pointer) return;
    const x = pointer.x;
    const y = pointer.y;
    setMarquee({ startX: x, startY: y, currentX: x, currentY: y });
    setSelectedNodeIds([]);
    setSelectedEdgeId('');
  };

  const onNodePointerDown = (event: React.PointerEvent<HTMLButtonElement>, nodeId: NodeId) => {
    if (editingNodeId || connectDrag) return;
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      if (isViewportPointOnConnectHandle(event.clientX, event.clientY, nodeId, layoutDirection)) {
        pendingRightConnectFromRef.current = nodeId;
        beginConnectDrag(nodeId);
        return;
      }
      setSelectedEdgeId('');
      setSelectedNodeIds([nodeId]);
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
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedNodeIds(prev => (prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]));
      return;
    }
    const isRootNode = rootNodeIds.has(nodeId);
    const nextSelection: NodeId[] = [nodeId];
    setSelectedNodeIds(nextSelection);
    const connectedNodeIds = isRootNode ? collectConnectedComponent(doc, nodeId) : [nodeId];
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
      startOffsets
    });
  };

  const onNodeMouseUp = (event: React.MouseEvent<HTMLButtonElement>, nodeId: NodeId) => {
    if (!connectDrag) return;
    event.preventDefault();
    event.stopPropagation();
    const fromId = connectDrag.fromNodeId;
    pendingRightConnectFromRef.current = null;
    stopConnectDragListeners();
    setConnectDrag(null);
    if (fromId !== nodeId && tryCreateEdge(fromId, nodeId)) {
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

  const startEdgeBendDrag = (event: React.PointerEvent<SVGCircleElement>, edgeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setEdgeBendDrag({ edgeId });
  };

  const beginConnectDrag = (nodeId: NodeId) => {
    stopConnectDragListeners();
    const nodePos = renderedPositionMap.get(nodeId);
    const nodeSize = nodeSizeMap[nodeId] || DEFAULT_NODE_SIZE;
    if (!nodePos) return;
    const start =
      layoutDirection === 'horizontal'
        ? { x: nodePos.x + nodeSize.width, y: nodePos.y + nodeSize.height / 2 }
        : { x: nodePos.x + nodeSize.width / 2, y: nodePos.y + nodeSize.height };
    setConnectDrag({ fromNodeId: nodeId, start, current: start, hoverTargetNodeId: null });
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

  const startConnectDrag = (event: React.PointerEvent<HTMLSpanElement>, nodeId: NodeId) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 2 || event.buttons === 2) {
      pendingRightConnectFromRef.current = nodeId;
    }
    beginConnectDrag(nodeId);
  };

  React.useEffect(() => {
    const onRightMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) return;
      if (editingNodeId || connectDrag) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const nodeId =
        getNodeIdFromEventTarget(target) ||
        getConnectHandleNodeIdFromViewportPoint(event.clientX, event.clientY, layoutDirection);
      if (!nodeId) return;
      if (!target.closest('.node-connect-handle') && !isViewportPointOnConnectHandle(event.clientX, event.clientY, nodeId, layoutDirection)) {
        return;
      }
      event.preventDefault();
      pendingRightConnectFromRef.current = nodeId;
      beginConnectDrag(nodeId);
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
      getConnectHandleNodeIdFromViewportPoint(event.clientX, event.clientY, layoutDirection);
    if (!nodeId) return;
    if (!target.closest('.node-connect-handle') && !isViewportPointOnConnectHandle(event.clientX, event.clientY, nodeId, layoutDirection)) {
      return;
    }
    pendingRightConnectFromRef.current = nodeId;
    event.preventDefault();
    event.stopPropagation();
    beginConnectDrag(nodeId);
  };

  const onCanvasMouseUpCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    const fromId = pendingRightConnectFromRef.current;
    pendingRightConnectFromRef.current = null;
    if (!fromId) return;
    const pointer = getCanvasContentPoint(event.clientX, event.clientY);
    const targetId =
      getNodeIdFromViewportPoint(event.clientX, event.clientY) ||
      getNodeIdFromEventTarget(event.target) ||
      (pointer ? findNodeAtCanvasPoint(pointer.x, pointer.y) : null);
    stopConnectDragListeners();
    setConnectDrag(null);
    if (targetId && targetId !== fromId && tryCreateEdge(fromId, targetId)) {
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
    return () => stopConnectDragListeners();
  }, [stopConnectDragListeners]);

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

  const selectedFontFamily = sameSelectedValue(selectedNodes, style => style?.fontFamily);
  const selectedFontSize = sameSelectedValue(selectedNodes, style => style?.fontSize);
  const selectedTextColor = sameSelectedValue(selectedNodes, style => style?.textColor);
  const selectedBackgroundColor = sameSelectedValue(selectedNodes, style => style?.backgroundColor);
  const selectedTextAlign = sameSelectedValue(selectedNodes, style => style?.textAlign);
  const selectedShape = sameSelectedValue(selectedNodes, style => style?.shape);
  const selectedTagId = sameSelectedValue(selectedNodes, style => style?.tagId);
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
      <div className="toolbar-button-row">
        <button type="button" onClick={fitCanvasToView}>
          Fit
        </button>
        <button
          type="button"
          onClick={resetSelectedEdgeBend}
          disabled={!selectedEdgeId || !edgeBends[selectedEdgeId]}
        >
          Reset Bend
        </button>
      </div>
    </>
  );

  const renderNodeToolbar = () => (
    <>
      <div className="toolbar-title">Node Style</div>
      <div className="toolbar-subtitle">{selectedNodeIds.length} selected</div>
      <label className="toolbar-field">
        <span>Font</span>
        <select
          value={selectedFontFamily || ''}
          onChange={event => applySelectedNodeStyle({ fontFamily: event.target.value })}
        >
          <option value="" disabled>
            Mixed/default
          </option>
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
          value={selectedFontSize || ''}
          onChange={event => applySelectedNodeStyle({ fontSize: Number(event.target.value) })}
        >
          <option value="" disabled>
            Mixed/default
          </option>
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
          className={isAllBold ? 'mode-btn-active' : hasMixedBold ? 'mode-btn-mixed' : ''}
          onClick={() => applySelectedNodeStyle({ bold: !isAllBold })}
        >
          B
        </button>
        <button
          type="button"
          className={isAllItalic ? 'mode-btn-active' : hasMixedItalic ? 'mode-btn-mixed' : ''}
          onClick={() => applySelectedNodeStyle({ italic: !isAllItalic })}
        >
          I
        </button>
        <button
          type="button"
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
            className={selectedTextAlign === align ? 'mode-btn-active' : ''}
            onClick={() => applySelectedNodeStyle({ textAlign: align })}
          >
            {align[0].toUpperCase()}
          </button>
        ))}
      </div>
      <label className="toolbar-field">
        <span>Text Color</span>
        <input
          type="color"
          value={selectedTextColor || '#0f172a'}
          onChange={event => applySelectedNodeStyle({ textColor: event.target.value })}
        />
      </label>
      <label className="toolbar-field">
        <span>Node Color</span>
        <input
          type="color"
          value={selectedBackgroundColor || '#ffffff'}
          onChange={event => applySelectedNodeStyle({ backgroundColor: event.target.value })}
        />
      </label>
      <label className="toolbar-field">
        <span>Shape</span>
        <select
          value={selectedShape || ''}
          onChange={event => applySelectedNodeStyle({ shape: event.target.value as NodeShape })}
        >
          <option value="" disabled>
            Mixed/default
          </option>
          {NODE_SHAPES.map(shape => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <span>Tag</span>
        <select
          value={selectedTagId || ''}
          onChange={event => applySelectedNodeStyle({ tagId: event.target.value || undefined })}
        >
          <option value="">None</option>
          {doc.settings.tags.map(tag => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>
      <div className="tag-list">
        <div className="tag-list-header">
          <span>Tag List</span>
          <button type="button" aria-label="Add tag" title="Add tag" onClick={addCustomTag}>
            +
          </button>
        </div>
        {doc.settings.tags.map(tag => (
          <div key={tag.id} className="tag-row">
            <input
              type="color"
              value={tag.color}
              onChange={event => recolorTag(tag, event.target.value)}
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
        <button
          type="button"
          className="toolbar-toggle-btn"
          onClick={() => setToolbarVisible(!activeTab.toolbarVisible)}
          title={activeTab.toolbarVisible ? 'Hide toolbar' : 'Show toolbar'}
        >
          {activeTab.toolbarVisible ? '▧' : '▨'}
        </button>
      </header>

      <section className="panel canvas-panel">
        <div className="canvas-workspace">
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
                className="canvas-surface"
                data-testid="canvas-surface"
                style={{ width: canvasSize.width, height: canvasSize.height, zoom: canvasZoom }}
                onPointerDown={onCanvasPointerDown}
                onMouseDownCapture={onCanvasMouseDownCapture}
                onMouseUpCapture={onCanvasMouseUpCapture}
                onWheel={onCanvasWheel}
                onContextMenu={event => event.preventDefault()}
              >
                <svg className="edge-layer" aria-label="edge-layer" style={{ width: canvasSize.width, height: canvasSize.height }}>
                  {doc.edges.map(edge => {
                    const fromPos = renderedPositionMap.get(edge.from);
                    const toPos = renderedPositionMap.get(edge.to);
                    if (!fromPos || !toPos) return null;
                    const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                    const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                    const endpoints = getEdgeEndpoints(fromPos, toPos, layoutDirection, fromSize, toSize);
                    const lane = edgeLaneMap.get(edge.id) || 0;
                    const forceBend = edgeForceBendMap.get(edge.id) || false;
                    const selected = edge.id === selectedEdgeId;
                    const bend = edgeBends[edge.id];
                    return (
                      <path
                        key={edge.id}
                        data-testid={`edge-path-${edge.id}`}
                        d={edgePath(endpoints.from, endpoints.to, lane, layoutDirection, fromSize, toSize, forceBend, bend)}
                        className={selected ? 'edge-path edge-path-selected' : 'edge-path'}
                        style={selected ? undefined : { stroke: activeTheme.edge }}
                        onPointerDown={event => {
                          event.stopPropagation();
                          setSelectedEdgeId(edge.id);
                          setSelectedNodeIds([]);
                        }}
                        onClick={() => {
                          setSelectedEdgeId(edge.id);
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
                  {doc.edges.map(edge => {
                    if (edge.id !== selectedEdgeId) return null;
                    const fromPos = renderedPositionMap.get(edge.from);
                    const toPos = renderedPositionMap.get(edge.to);
                    if (!fromPos || !toPos) return null;
                    const fromSize = nodeSizeMap[edge.from] || DEFAULT_NODE_SIZE;
                    const toSize = nodeSizeMap[edge.to] || DEFAULT_NODE_SIZE;
                    const endpoints = getEdgeEndpoints(fromPos, toPos, layoutDirection, fromSize, toSize);
                    const bend = edgeBends[edge.id] || edgeMidpoint(endpoints.from, endpoints.to);
                    return (
                      <circle
                        key={`bend-${edge.id}`}
                        className="edge-bend-handle"
                        cx={bend.x}
                        cy={bend.y}
                        r={7}
                        onPointerDown={event => startEdgeBendDrag(event, edge.id)}
                      />
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
                  const connectHandleVisible =
                    connectDrag?.fromNodeId === node.id || connectDrag?.hoverTargetNodeId === node.id;
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
                      data-tag-name={nodeTag?.name}
                      style={{
                        left: rendered.x,
                        top: rendered.y,
                        width: nodeSize.width,
                        height: nodeSize.height,
                        ...getNodeVisualStyle(node.id, node.style)
                      }}
                      data-testid={`node-${node.id}`}
                      type="button"
                      title={node.style?.tagId ? tagNameById.get(node.style.tagId) || '' : ''}
                      onPointerDown={event => onNodePointerDown(event, node.id)}
                      onMouseUp={event => onNodeMouseUp(event, node.id)}
                      onContextMenu={onNodeContextMenu}
                      onDoubleClick={() => startEditingNode(node.id)}
                    >
                      {editing ? (
                        <input
                          className="node-label-input"
                          value={editingLabel}
                          onInput={event => setEditingLabel(clampNodeLabel(event.currentTarget.value))}
                          onCompositionUpdate={event => setEditingLabel(clampNodeLabel(event.currentTarget.value))}
                          onCompositionEnd={event => setEditingLabel(clampNodeLabel(event.currentTarget.value))}
                          onChange={event => setEditingLabel(clampNodeLabel(event.currentTarget.value))}
                          onBlur={commitEditingNode}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitEditingNode();
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              setEditingNodeId(null);
                              setEditingLabel('');
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <div>{node.label}</div>
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
                {hasNodeSelection ? renderNodeToolbar() : renderMapToolbar()}
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </main>
  );
}
