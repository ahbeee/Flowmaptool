import type { FlowNode, FlowTag, TaskPriority } from '@shared/graph';
import type { OutlineTreeNode } from './outline';

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'critical'];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  critical: 'Critical'
};

const TASK_PRIORITY_SORT_ORDER = new Map<TaskPriority, number>(
  TASK_PRIORITIES.map((priority, index) => [priority, index])
);

export const TASK_TABLE_COLUMNS = [
  { key: 'task', label: 'Task' },
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
  { key: 'progress', label: 'Progress' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'start', label: 'Start' },
  { key: 'due', label: 'Due' },
  { key: 'tag', label: 'Tag' },
  { key: 'notes', label: 'Notes' }
] as const;

export type TaskTableSortKey = (typeof TASK_TABLE_COLUMNS)[number]['key'];
export type TaskTableColumnKey = TaskTableSortKey;
export type TaskTableSortDirection = 'asc' | 'desc';
export type TaskTableSort = {
  key: TaskTableSortKey;
  direction: TaskTableSortDirection;
};
export type TaskTableFilters = {
  tagId?: string;
  assignee?: string;
};
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
  const tagId = filters?.tagId?.trim();
  const assignee = filters?.assignee?.trim();
  return {
    ...(tagId ? { tagId } : {}),
    ...(assignee ? { assignee } : {})
  };
}

export function doesTaskTableRowMatchFilters(row: TaskTableRow, filters: TaskTableFilters | undefined): boolean {
  const normalized = normalizeTaskTableFilters(filters);
  if (normalized.tagId && row.tagId !== normalized.tagId) return false;
  if (normalized.assignee) {
    const rowAssignee = normalizeTaskSortString(row.node.task?.assignee);
    if (rowAssignee !== normalizeTaskSortString(normalized.assignee)) return false;
  }
  return true;
}

export function buildTaskTableRows(
  outlineTree: OutlineTreeNode[],
  tagById: Map<string, FlowTag>,
  sort?: TaskTableSort,
  filters?: TaskTableFilters
): TaskTableRow[] {
  const rows: TaskTableRow[] = [];

  const visit = (item: OutlineTreeNode, parents: FlowNode[]) => {
    const tag = item.node.style?.tagId ? tagById.get(item.node.style.tagId) : undefined;
    if (tag) {
      rows.push({
        node: item.node,
        category: parents.map(getTaskNodeLabel).join(' > '),
        tagId: tag.id,
        tagName: tag.name,
        originalIndex: rows.length
      });
    }
    item.children.forEach(child => visit(child, [...parents, item.node]));
  };

  outlineTree.forEach(item => visit(item, []));
  const filteredRows = filters ? rows.filter(row => doesTaskTableRowMatchFilters(row, filters)) : rows;
  return sort ? [...filteredRows].sort((left, right) => compareTaskTableRows(left, right, sort)) : filteredRows;
}
