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
export type TaskTableSortDirection = 'asc' | 'desc';
export type TaskTableSort = {
  key: TaskTableSortKey;
  direction: TaskTableSortDirection;
};
export type TaskTableRow = {
  node: FlowNode;
  category: string;
  tagName: string;
  originalIndex: number;
};

export function getTaskNodeLabel(node: FlowNode): string {
  return node.label.trim() || 'Untitled Node';
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

export function buildTaskTableRows(
  outlineTree: OutlineTreeNode[],
  tagById: Map<string, FlowTag>,
  sort?: TaskTableSort
): TaskTableRow[] {
  const rows: TaskTableRow[] = [];

  const visit = (item: OutlineTreeNode, parents: FlowNode[]) => {
    const tag = item.node.style?.tagId ? tagById.get(item.node.style.tagId) : undefined;
    if (tag) {
      rows.push({
        node: item.node,
        category: parents.map(getTaskNodeLabel).join(' > '),
        tagName: tag.name,
        originalIndex: rows.length
      });
    }
    item.children.forEach(child => visit(child, [...parents, item.node]));
  };

  outlineTree.forEach(item => visit(item, []));
  return sort ? [...rows].sort((left, right) => compareTaskTableRows(left, right, sort)) : rows;
}
