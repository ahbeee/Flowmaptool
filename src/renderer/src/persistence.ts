import { addNode, deserialize, SCHEMA_VERSION, type FlowDoc, type NodeId, type NodeStyle } from '../../shared/graph';
import type { LayoutDirection } from '../../shared/layout';
import type { NodeOffsetMap } from '../../shared/local-reflow';
import type { Point } from './routing-geometry';
import {
  DEFAULT_VISIBLE_TASK_TABLE_COLUMN_KEYS,
  getVisibleTaskTableColumns,
  TASK_TABLE_COLUMNS,
  TASK_TABLE_DENSITY_OPTIONS,
  TASK_TABLE_DUE_FILTERS,
  type TaskTableView,
  sanitizeTaskTableColumnWidths,
  type TaskTableColumnKey,
  type TaskTableColumnWidthMap,
  type TaskTableDensity,
  type TaskTableFilters,
  type TaskTableSort
} from './task-table';

export type NodeOffsetsByDirection = Record<LayoutDirection, NodeOffsetMap>;
export type EdgeBend = { x: number; y: number };
export type EdgeBendMap = Record<string, EdgeBend>;
export type EdgeBendsByDirection = Record<LayoutDirection, EdgeBendMap>;
export type EdgeRoute = { points: Point[] };
export type EdgeRouteMap = Record<string, EdgeRoute>;
export type EdgeRoutesByDirection = Record<LayoutDirection, EdgeRouteMap>;
export type PersistedTaskTableUiState = {
  sort?: TaskTableSort;
  filters: TaskTableFilters;
  visibleColumnKeys: TaskTableColumnKey[];
  columnWidths: TaskTableColumnWidthMap;
  expanded: boolean;
  density: TaskTableDensity;
  view: TaskTableView;
};

export type PersistedUiState = {
  layoutDirection: LayoutDirection;
  nodeOffsetsByDirection: NodeOffsetsByDirection;
  edgeBendsByDirection: EdgeBendsByDirection;
  edgeRoutesByDirection: EdgeRoutesByDirection;
  toolbarVisible: boolean;
  taskTable: PersistedTaskTableUiState;
};

export type PersistedQflowFile = {
  schemaVersion: 1;
  doc: FlowDoc;
  ui?: Partial<PersistedUiState>;
};

export type ParsePersistedQflowOptions = {
  emptyRootLabel: string;
  emptyRootStyle: NodeStyle;
};

export type PersistedQflowSerializable = {
  doc: FlowDoc;
  layoutDirection: LayoutDirection;
  nodeOffsetsByDirection: NodeOffsetsByDirection;
  edgeBendsByDirection: EdgeBendsByDirection;
  edgeRoutesByDirection: EdgeRoutesByDirection;
  toolbarVisible: boolean;
  taskTable: PersistedTaskTableUiState;
};

export function emptyOffsetsByDirection(): NodeOffsetsByDirection {
  return { horizontal: {}, vertical: {} };
}

export function emptyEdgeBendsByDirection(): EdgeBendsByDirection {
  return { horizontal: {}, vertical: {} };
}

export function emptyEdgeRoutesByDirection(): EdgeRoutesByDirection {
  return { horizontal: {}, vertical: {} };
}

export function defaultTaskTableUiState(): PersistedTaskTableUiState {
  return {
    filters: {},
    visibleColumnKeys: [...DEFAULT_VISIBLE_TASK_TABLE_COLUMN_KEYS],
    columnWidths: {},
    expanded: false,
    density: 'comfortable',
    view: 'all'
  };
}

function ensureDocHasNode(doc: FlowDoc, options: ParsePersistedQflowOptions): FlowDoc {
  return doc.nodes.length === 0 ? addNode(doc, options.emptyRootLabel, options.emptyRootStyle) : doc;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sanitizeNodeOffsetMap(value: unknown, validNodeIds: Set<NodeId>): NodeOffsetMap {
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

export function sanitizeEdgeBendMap(value: unknown, validEdgeIds: Set<string>): EdgeBendMap {
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

export function sanitizeEdgeRouteMap(value: unknown, validEdgeIds: Set<string>): EdgeRouteMap {
  if (!value || typeof value !== 'object') return {};
  const result: EdgeRouteMap = {};
  for (const [id, rawRoute] of Object.entries(value as Record<string, unknown>)) {
    if (!validEdgeIds.has(id)) continue;
    if (!rawRoute || typeof rawRoute !== 'object') continue;
    const rawPoints = Array.isArray((rawRoute as { points?: unknown }).points)
      ? (rawRoute as { points: unknown[] }).points
      : Array.isArray(rawRoute)
        ? (rawRoute as unknown[])
        : [];
    const points = rawPoints
      .map(rawPoint => {
        if (!rawPoint || typeof rawPoint !== 'object') return null;
        const x = asFiniteNumber((rawPoint as { x?: unknown }).x);
        const y = asFiniteNumber((rawPoint as { y?: unknown }).y);
        return x === null || y === null ? null : { x, y };
      })
      .filter((point): point is Point => point !== null)
      .slice(0, 12);
    if (points.length > 0) result[id] = { points };
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeTaskTableSort(value: unknown, visibleColumnKeys: TaskTableColumnKey[]): TaskTableSort | undefined {
  if (!isRecord(value)) return undefined;
  const validKeys = new Set(TASK_TABLE_COLUMNS.map(column => column.key));
  const key = value.key;
  const direction = value.direction;
  if (typeof key !== 'string' || !validKeys.has(key as TaskTableColumnKey)) return undefined;
  if (direction !== 'asc' && direction !== 'desc') return undefined;
  if (!visibleColumnKeys.includes(key as TaskTableColumnKey)) return undefined;
  return { key: key as TaskTableColumnKey, direction };
}

export function sanitizeTaskTableUiState(value: unknown): PersistedTaskTableUiState {
  if (!isRecord(value)) return defaultTaskTableUiState();

  const visibleColumnKeys = Array.isArray(value.visibleColumnKeys)
    ? getVisibleTaskTableColumns(
        value.visibleColumnKeys.filter((key): key is TaskTableColumnKey => typeof key === 'string')
      ).map(column => column.key)
    : [...DEFAULT_VISIBLE_TASK_TABLE_COLUMN_KEYS];

  const rawFilters = isRecord(value.filters) ? value.filters : {};
  const tagId = typeof rawFilters.tagId === 'string' && rawFilters.tagId.trim() ? rawFilters.tagId.trim() : undefined;
  const assignee =
    typeof rawFilters.assignee === 'string' && rawFilters.assignee.trim() ? rawFilters.assignee.trim() : undefined;
  const due = TASK_TABLE_DUE_FILTERS.find(option => option.key === rawFilters.due)?.key;
  const density = TASK_TABLE_DENSITY_OPTIONS.find(option => option.key === value.density)?.key || 'comfortable';
  const view =
    value.view === 'all' ||
    value.view === 'today' ||
    value.view === 'upcoming' ||
    value.view === 'backlog' ||
    value.view === 'done'
      ? value.view
      : 'all';

  return {
    sort: sanitizeTaskTableSort(value.sort, visibleColumnKeys),
    filters: {
      ...(tagId ? { tagId } : {}),
      ...(assignee ? { assignee } : {}),
      ...(due ? { due } : {})
    },
    visibleColumnKeys,
    columnWidths: sanitizeTaskTableColumnWidths(value.columnWidths),
    expanded: value.expanded === true,
    density,
    view
  };
}

function parseJsonFile(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
}

function assertSupportedFileVersion(value: unknown) {
  if (!isRecord(value)) return;
  const version = value.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    throw new Error('This file was created by a newer Flowmaptool version.');
  }
}

function assertFlowDocShape(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error('The selected file is not a Flowmaptool document.');
  }
}

function getPersistedSourceDoc(parsed: unknown): { sourceDoc: unknown; rawUi?: PersistedUiState } {
  if (!isRecord(parsed)) {
    throw new Error('The selected file is not a Flowmaptool document.');
  }

  assertSupportedFileVersion(parsed);
  if ('doc' in parsed) {
    const sourceDoc = parsed.doc;
    if (!isRecord(sourceDoc)) {
      throw new Error('The selected file is not a Flowmaptool document.');
    }
    assertSupportedFileVersion(sourceDoc);
    assertFlowDocShape(sourceDoc);
    return { sourceDoc, rawUi: isRecord(parsed.ui) ? (parsed.ui as PersistedUiState) : undefined };
  }

  assertFlowDocShape(parsed);
  return { sourceDoc: parsed };
}

export function parsePersistedQflow(
  raw: string,
  options: ParsePersistedQflowOptions
): { doc: FlowDoc; ui: PersistedUiState } {
  const parsed = parseJsonFile(raw);
  const { sourceDoc, rawUi } = getPersistedSourceDoc(parsed);
  const doc = ensureDocHasNode(deserialize(JSON.stringify(sourceDoc)), options);
  const validNodeIds = new Set(doc.nodes.map(node => node.id));
  const validEdgeIds = new Set(doc.edges.map(edge => edge.id));
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
  const rawEdgeRoutesByDirection = (rawUi as { edgeRoutesByDirection?: Partial<EdgeRoutesByDirection> } | undefined)
    ?.edgeRoutesByDirection;
  const edgeRoutesByDirection: EdgeRoutesByDirection = {
    horizontal: sanitizeEdgeRouteMap(rawEdgeRoutesByDirection?.horizontal, validEdgeIds),
    vertical: sanitizeEdgeRouteMap(rawEdgeRoutesByDirection?.vertical, validEdgeIds)
  };
  const legacyEdgeBends = sanitizeEdgeBendMap((rawUi as { edgeBends?: unknown } | undefined)?.edgeBends, validEdgeIds);
  if (Object.keys(legacyEdgeBends).length > 0) {
    edgeBendsByDirection[layoutDirection] = {
      ...edgeBendsByDirection[layoutDirection],
      ...legacyEdgeBends
    };
  }
  const toolbarVisible = rawUi?.toolbarVisible === false ? false : true;
  const taskTable = sanitizeTaskTableUiState(rawUi?.taskTable);
  return {
    doc,
    ui: {
      layoutDirection,
      nodeOffsetsByDirection,
      edgeBendsByDirection,
      edgeRoutesByDirection,
      toolbarVisible,
      taskTable
    }
  };
}

export function serializePersistedQflow(input: PersistedQflowSerializable): string {
  const payload: PersistedQflowFile = {
    schemaVersion: 1,
    doc: input.doc,
    ui: {
      layoutDirection: input.layoutDirection,
      nodeOffsetsByDirection: input.nodeOffsetsByDirection,
      edgeBendsByDirection: input.edgeBendsByDirection,
      edgeRoutesByDirection: input.edgeRoutesByDirection,
      toolbarVisible: input.toolbarVisible,
      taskTable: input.taskTable
    }
  };
  return JSON.stringify(payload, null, 2);
}
