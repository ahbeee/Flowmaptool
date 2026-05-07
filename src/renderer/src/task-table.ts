import type { FlowNode, FlowTag, TaskPriority, TaskStatus } from '@shared/graph';
import type { OutlineTreeNode } from './outline';

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'critical'];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  critical: 'Critical'
};
export const TASK_STATUSES: TaskStatus[] = ['inbox', 'next', 'waiting', 'scheduled', 'done'];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  next: 'Next',
  waiting: 'Waiting',
  scheduled: 'Scheduled',
  done: 'Done'
};

const TASK_PRIORITY_SORT_ORDER = new Map<TaskPriority, number>(
  TASK_PRIORITIES.map((priority, index) => [priority, index])
);

export const TASK_TABLE_COLUMNS = [
  { key: 'task', label: 'Task' },
  { key: 'status', label: 'Status' },
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
  { key: 'progress', label: 'Progress' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'start', label: 'Start' },
  { key: 'due', label: 'Due' },
  { key: 'tag', label: 'Tag' },
  { key: 'notes', label: 'Notes' }
] as const;

export type TaskTableColumn = (typeof TASK_TABLE_COLUMNS)[number];
export type TaskTableSortKey = (typeof TASK_TABLE_COLUMNS)[number]['key'];
export type TaskTableColumnKey = TaskTableSortKey;
export type TaskTableSortDirection = 'asc' | 'desc';
export type TaskTableSort = {
  key: TaskTableSortKey;
  direction: TaskTableSortDirection;
};
export type TaskTableDueFilter = 'overdue' | 'today' | 'next7' | 'none';
export type TaskTableDueStatus = 'overdue' | 'today' | 'soon' | 'none';
export type TaskTableDensity = 'comfortable' | 'compact';
export type TaskTableView = 'all' | 'today' | 'upcoming' | 'backlog' | 'done';
export type TaskTableFilters = {
  query?: string;
  tagId?: string;
  assignee?: string;
  due?: TaskTableDueFilter;
};
export type TaskTableColumnWidthMap = Partial<Record<TaskTableColumnKey, number>>;
export type TaskTableRow = {
  node: FlowNode;
  category: string;
  tagId: string;
  tagName: string;
  originalIndex: number;
};

export const DEFAULT_VISIBLE_TASK_TABLE_COLUMN_KEYS: TaskTableColumnKey[] = TASK_TABLE_COLUMNS.map(
  column => column.key
);
export const REQUIRED_TASK_TABLE_COLUMN_KEYS = ['task'] as const satisfies readonly TaskTableColumnKey[];
export const TASK_TABLE_DUE_FILTERS: Array<{ key: TaskTableDueFilter; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'next7', label: 'Next 7 days' },
  { key: 'none', label: 'No due date' }
];
export const TASK_TABLE_DENSITY_OPTIONS: Array<{ key: TaskTableDensity; label: string }> = [
  { key: 'comfortable', label: 'Comfortable' },
  { key: 'compact', label: 'Compact' }
];
export const TASK_TABLE_COLUMN_MIN_WIDTH = 72;
export const TASK_TABLE_COLUMN_MAX_WIDTH = 520;
export const DEFAULT_TASK_TABLE_COLUMN_WIDTHS: Record<TaskTableColumnKey, number> = {
  task: 210,
  status: 128,
  category: 300,
  priority: 128,
  progress: 112,
  assignee: 148,
  start: 142,
  due: 142,
  tag: 104,
  notes: 180
};

export function getTaskNodeLabel(node: FlowNode): string {
  return node.label.trim() || 'Untitled Node';
}

export function isTaskTableColumnHideable(key: TaskTableColumnKey): boolean {
  return !REQUIRED_TASK_TABLE_COLUMN_KEYS.includes(key as (typeof REQUIRED_TASK_TABLE_COLUMN_KEYS)[number]);
}

export function getVisibleTaskTableColumns(visibleKeys: Iterable<TaskTableColumnKey>) {
  const visibleKeySet = new Set(visibleKeys);
  REQUIRED_TASK_TABLE_COLUMN_KEYS.forEach(key => visibleKeySet.add(key));
  return TASK_TABLE_COLUMNS.filter(column => visibleKeySet.has(column.key));
}

export function clampTaskTableColumnWidth(width: number): number {
  if (!Number.isFinite(width)) return TASK_TABLE_COLUMN_MIN_WIDTH;
  return Math.round(Math.max(TASK_TABLE_COLUMN_MIN_WIDTH, Math.min(TASK_TABLE_COLUMN_MAX_WIDTH, width)));
}

export function getTaskTableColumnWidth(widths: TaskTableColumnWidthMap | undefined, key: TaskTableColumnKey): number {
  const width = widths?.[key] ?? DEFAULT_TASK_TABLE_COLUMN_WIDTHS[key];
  return clampTaskTableColumnWidth(width);
}

export function sanitizeTaskTableColumnWidths(value: unknown): TaskTableColumnWidthMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const validKeys = new Set(TASK_TABLE_COLUMNS.map(column => column.key));
  const widths: TaskTableColumnWidthMap = {};
  for (const [key, rawWidth] of Object.entries(value as Record<string, unknown>)) {
    if (!validKeys.has(key as TaskTableColumnKey) || typeof rawWidth !== 'number' || !Number.isFinite(rawWidth)) {
      continue;
    }
    widths[key as TaskTableColumnKey] = clampTaskTableColumnWidth(rawWidth);
  }
  return widths;
}

export function getNextVisibleTaskTableColumnKeys(
  currentKeys: Iterable<TaskTableColumnKey>,
  key: TaskTableColumnKey
): TaskTableColumnKey[] {
  const nextKeys = new Set(currentKeys);
  REQUIRED_TASK_TABLE_COLUMN_KEYS.forEach(requiredKey => nextKeys.add(requiredKey));
  if (isTaskTableColumnHideable(key)) {
    if (nextKeys.has(key)) {
      nextKeys.delete(key);
    } else {
      nextKeys.add(key);
    }
  }

  return TASK_TABLE_COLUMNS.map(column => column.key).filter(columnKey => nextKeys.has(columnKey));
}

function normalizeTaskSortString(value: string | undefined): string {
  return (value || '').trim().toLocaleLowerCase();
}

function compareOptionalTaskValues(
  left: string | number | undefined,
  right: string | number | undefined,
  direction: TaskTableSortDirection
): number {
  const leftEmpty = left === undefined || left === '';
  const rightEmpty = right === undefined || right === '';
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0;
    return leftEmpty ? 1 : -1;
  }

  const result =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function getTaskSortValue(row: TaskTableRow, key: TaskTableSortKey): string | number | undefined {
  const task = row.node.task;
  switch (key) {
    case 'task':
      return normalizeTaskSortString(getTaskNodeLabel(row.node));
    case 'category':
      return normalizeTaskSortString(row.category);
    case 'status':
      return row.node.task?.status ? TASK_STATUSES.indexOf(row.node.task.status) : undefined;
    case 'priority':
      return task?.priority ? TASK_PRIORITY_SORT_ORDER.get(task.priority) : undefined;
    case 'progress':
      return task ? task.progress : undefined;
    case 'assignee':
      return normalizeTaskSortString(task?.assignee);
    case 'start':
      return task?.startDate || undefined;
    case 'due':
      return task?.dueDate || undefined;
    case 'tag':
      return normalizeTaskSortString(row.tagName);
    case 'notes':
      return normalizeTaskSortString(task?.note);
  }
}

export function compareTaskTableRows(left: TaskTableRow, right: TaskTableRow, sort: TaskTableSort): number {
  return (
    compareOptionalTaskValues(getTaskSortValue(left, sort.key), getTaskSortValue(right, sort.key), sort.direction) ||
    left.originalIndex - right.originalIndex
  );
}

export function getNextTaskTableSort(current: TaskTableSort | undefined, key: TaskTableSortKey): TaskTableSort {
  return {
    key,
    direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
  };
}

export function normalizeTaskTableFilters(filters: TaskTableFilters | undefined): TaskTableFilters {
  const query = filters?.query?.trim();
  const tagId = filters?.tagId?.trim();
  const assignee = filters?.assignee?.trim();
  const rawDue = filters?.due;
  const due = TASK_TABLE_DUE_FILTERS.some(option => option.key === rawDue) ? rawDue : undefined;
  return {
    ...(query ? { query } : {}),
    ...(tagId ? { tagId } : {}),
    ...(assignee ? { assignee } : {}),
    ...(due ? { due } : {})
  };
}

function doesTaskTableRowMatchSearch(row: TaskTableRow, query: string): boolean {
  const haystack = [
    getTaskNodeLabel(row.node),
    row.category,
    row.tagName,
    row.node.task?.assignee,
    row.node.task?.note,
    row.node.task?.priority,
    getTaskStatus(row.node)
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
  return haystack.includes(query.toLocaleLowerCase());
}

function normalizeDateKey(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value;
}

export function getTaskTableTodayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return getTaskTableTodayKey(new Date(year, month - 1, day + days));
}

export function getTaskTableDueStatus(
  dueDate: string | undefined,
  todayKey = getTaskTableTodayKey()
): TaskTableDueStatus {
  const normalizedDueDate = normalizeDateKey(dueDate);
  if (!normalizedDueDate) return 'none';
  if (normalizedDueDate < todayKey) return 'overdue';
  if (normalizedDueDate === todayKey) return 'today';
  if (normalizedDueDate <= addDaysToDateKey(todayKey, 7)) return 'soon';
  return 'none';
}

function doesDueDateMatchFilter(dueDate: string | undefined, dueFilter: TaskTableDueFilter, todayKey: string): boolean {
  const normalizedDueDate = normalizeDateKey(dueDate);
  if (dueFilter === 'none') return !normalizedDueDate;
  if (!normalizedDueDate) return false;
  if (dueFilter === 'overdue' || dueFilter === 'today') return getTaskTableDueStatus(dueDate, todayKey) === dueFilter;
  return normalizedDueDate >= todayKey && normalizedDueDate <= addDaysToDateKey(todayKey, 7);
}

export function doesTaskTableRowMatchFilters(
  row: TaskTableRow,
  filters: TaskTableFilters | undefined,
  todayKey = getTaskTableTodayKey()
): boolean {
  const normalized = normalizeTaskTableFilters(filters);
  if (normalized.query && !doesTaskTableRowMatchSearch(row, normalized.query)) return false;
  if (normalized.tagId && row.tagId !== normalized.tagId) return false;
  if (normalized.assignee) {
    const rowAssignee = normalizeTaskSortString(row.node.task?.assignee);
    if (rowAssignee !== normalizeTaskSortString(normalized.assignee)) return false;
  }
  if (normalized.due && !doesDueDateMatchFilter(row.node.task?.dueDate, normalized.due, todayKey)) return false;
  return true;
}

export function getTaskStatus(node: FlowNode): TaskStatus {
  if (node.task?.done) return 'done';
  return node.task?.status || 'inbox';
}

export function doesTaskTableRowMatchView(
  row: TaskTableRow,
  view: TaskTableView,
  todayKey = getTaskTableTodayKey()
): boolean {
  const task = row.node.task;
  const status = getTaskStatus(row.node);
  const dueDate = normalizeDateKey(task?.dueDate);
  if (view === 'all') return true;
  if (view === 'done') return status === 'done';
  if (status === 'done') return false;
  if (view === 'today') {
    return (
      status === 'next' ||
      (dueDate !== undefined && dueDate <= todayKey) ||
      (!dueDate && (task?.priority === 'high' || task?.priority === 'critical'))
    );
  }
  if (view === 'upcoming') {
    return dueDate !== undefined && dueDate > todayKey && dueDate <= addDaysToDateKey(todayKey, 7);
  }
  return !dueDate && (status === 'inbox' || status === 'waiting');
}

export function buildTaskTableRows(
  outlineTree: OutlineTreeNode[],
  tagById: Map<string, FlowTag>,
  sort?: TaskTableSort,
  filters?: TaskTableFilters,
  todayKey?: string,
  view: TaskTableView = 'all'
): TaskTableRow[] {
  const rows: TaskTableRow[] = [];

  const visit = (item: OutlineTreeNode, parents: FlowNode[]) => {
    const tag = item.node.style?.tagId ? tagById.get(item.node.style.tagId) : undefined;
    if (tag || item.node.task?.enabled) {
      rows.push({
        node: item.node,
        category: parents.map(getTaskNodeLabel).join(' > '),
        tagId: tag?.id || '',
        tagName: tag?.name || '',
        originalIndex: rows.length
      });
    }
    item.children.forEach(child => visit(child, [...parents, item.node]));
  };

  outlineTree.forEach(item => visit(item, []));
  const viewRows = rows.filter(row => doesTaskTableRowMatchView(row, view, todayKey));
  const filteredRows = filters
    ? viewRows.filter(row => doesTaskTableRowMatchFilters(row, filters, todayKey))
    : viewRows;
  return sort ? [...filteredRows].sort((left, right) => compareTaskTableRows(left, right, sort)) : filteredRows;
}
