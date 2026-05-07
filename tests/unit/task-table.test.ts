import { describe, expect, it } from 'vitest';
import type { FlowTag } from '../../src/shared/graph';
import type { OutlineTreeNode } from '../../src/renderer/src/outline';
import {
  buildTaskTableRows,
  clampTaskTableColumnWidth,
  DEFAULT_VISIBLE_TASK_TABLE_COLUMN_KEYS,
  doesTaskTableRowMatchView,
  getTaskTableColumnWidth,
  getNextTaskTableSort,
  getNextVisibleTaskTableColumnKeys,
  getTaskNodeLabel,
  getTaskStatus,
  getTaskTableDueStatus,
  getVisibleTaskTableColumns,
  isTaskTableColumnHideable,
  sanitizeTaskTableColumnWidths
} from '../../src/renderer/src/task-table';

const tags: FlowTag[] = [
  { id: 'tag-pending', name: 'Pending', color: '#ec4899' },
  { id: 'tag-done', name: 'Done', color: '#22c55e' }
];
const tagById = new Map(tags.map(tag => [tag.id, tag]));

function tree(): OutlineTreeNode[] {
  return [
    {
      node: { id: 'n1', label: 'Root' },
      children: [
        {
          node: {
            id: 'n2',
            label: 'Bravo',
            style: { tagId: 'tag-pending' },
            task: {
              enabled: true,
              done: false,
              status: 'next',
              priority: 'high',
              progress: 20,
              assignee: 'Zoe',
              dueDate: '2026-05-03'
            }
          },
          children: []
        },
        {
          node: {
            id: 'n3',
            label: ' Alpha ',
            style: { tagId: 'tag-done' },
            task: {
              enabled: true,
              done: false,
              status: 'scheduled',
              priority: 'low',
              progress: 90,
              assignee: 'Amy',
              dueDate: '2026-05-10'
            }
          },
          children: []
        },
        {
          node: { id: 'n4', label: 'Ignored' },
          children: []
        }
      ]
    }
  ];
}

describe('task table helpers', () => {
  it('derives rows from tagged outline nodes with category labels', () => {
    const rows = buildTaskTableRows(tree(), tagById);

    expect(rows.map(row => row.node.id)).toEqual(['n2', 'n3']);
    expect(rows.map(row => row.category)).toEqual(['Root', 'Root']);
    expect(rows.map(row => row.tagId)).toEqual(['tag-pending', 'tag-done']);
    expect(rows.map(row => row.tagName)).toEqual(['Pending', 'Done']);
  });

  it('sorts text and numeric task fields while keeping empty values last', () => {
    expect(buildTaskTableRows(tree(), tagById, { key: 'task', direction: 'asc' }).map(row => row.node.id)).toEqual([
      'n3',
      'n2'
    ]);
    expect(buildTaskTableRows(tree(), tagById, { key: 'progress', direction: 'desc' }).map(row => row.node.id)).toEqual(
      ['n3', 'n2']
    );
    expect(buildTaskTableRows(tree(), tagById, { key: 'assignee', direction: 'asc' }).map(row => row.node.id)).toEqual([
      'n3',
      'n2'
    ]);
  });

  it('normalizes blank task labels', () => {
    expect(getTaskNodeLabel({ id: 'n1', label: '   ' })).toBe('Untitled Node');
  });

  it('filters task rows by search, tag, and assignee', () => {
    expect(buildTaskTableRows(tree(), tagById, undefined, { query: 'brav' }).map(row => row.node.id)).toEqual(['n2']);
    expect(buildTaskTableRows(tree(), tagById, undefined, { query: 'done' }).map(row => row.node.id)).toEqual(['n3']);
    expect(buildTaskTableRows(tree(), tagById, undefined, { query: 'root zoe' }).map(row => row.node.id)).toEqual([]);
    expect(buildTaskTableRows(tree(), tagById, undefined, { tagId: 'tag-pending' }).map(row => row.node.id)).toEqual([
      'n2'
    ]);
    expect(buildTaskTableRows(tree(), tagById, undefined, { assignee: 'amy' }).map(row => row.node.id)).toEqual(['n3']);
    expect(
      buildTaskTableRows(tree(), tagById, undefined, { tagId: 'tag-pending', assignee: 'Amy' }).map(row => row.node.id)
    ).toEqual([]);
  });

  it('filters task rows by due date state', () => {
    expect(
      buildTaskTableRows(tree(), tagById, undefined, { due: 'overdue' }, '2026-05-04').map(row => row.node.id)
    ).toEqual(['n2']);
    expect(
      buildTaskTableRows(tree(), tagById, undefined, { due: 'next7' }, '2026-05-04').map(row => row.node.id)
    ).toEqual(['n3']);
    expect(
      buildTaskTableRows(tree(), tagById, undefined, { due: 'today' }, '2026-05-03').map(row => row.node.id)
    ).toEqual(['n2']);
    expect(buildTaskTableRows(tree(), tagById, undefined, { due: 'none' }, '2026-05-04')).toEqual([]);
  });

  it('classifies due dates for task table status styling', () => {
    expect(getTaskTableDueStatus('2026-05-03', '2026-05-04')).toBe('overdue');
    expect(getTaskTableDueStatus('2026-05-04', '2026-05-04')).toBe('today');
    expect(getTaskTableDueStatus('2026-05-05', '2026-05-04')).toBe('soon');
    expect(getTaskTableDueStatus(undefined, '2026-05-04')).toBe('none');
  });

  it('filters task rows by personal workbench views', () => {
    const rows = buildTaskTableRows(tree(), tagById, undefined, undefined, '2026-05-04', 'all');

    expect(getTaskStatus(rows[0].node)).toBe('next');
    expect(rows.filter(row => doesTaskTableRowMatchView(row, 'today', '2026-05-04')).map(row => row.node.id)).toEqual([
      'n2'
    ]);
    expect(
      rows.filter(row => doesTaskTableRowMatchView(row, 'upcoming', '2026-05-04')).map(row => row.node.id)
    ).toEqual(['n3']);
  });

  it('toggles sort direction only when selecting the same ascending column', () => {
    expect(getNextTaskTableSort(undefined, 'task')).toEqual({ key: 'task', direction: 'asc' });
    expect(getNextTaskTableSort({ key: 'task', direction: 'asc' }, 'task')).toEqual({
      key: 'task',
      direction: 'desc'
    });
    expect(getNextTaskTableSort({ key: 'task', direction: 'desc' }, 'task')).toEqual({
      key: 'task',
      direction: 'asc'
    });
    expect(getNextTaskTableSort({ key: 'task', direction: 'asc' }, 'priority')).toEqual({
      key: 'priority',
      direction: 'asc'
    });
  });

  it('keeps task table column visibility ordered with task always visible', () => {
    expect(isTaskTableColumnHideable('task')).toBe(false);
    expect(isTaskTableColumnHideable('priority')).toBe(true);

    const withoutPriority = getNextVisibleTaskTableColumnKeys(DEFAULT_VISIBLE_TASK_TABLE_COLUMN_KEYS, 'priority');
    expect(withoutPriority).not.toContain('priority');
    expect(getVisibleTaskTableColumns(withoutPriority).map(column => column.key)).toEqual([
      'task',
      'status',
      'category',
      'progress',
      'assignee',
      'start',
      'due',
      'tag',
      'notes'
    ]);

    expect(getNextVisibleTaskTableColumnKeys(withoutPriority, 'priority')).toEqual(
      DEFAULT_VISIBLE_TASK_TABLE_COLUMN_KEYS
    );
    expect(getNextVisibleTaskTableColumnKeys(['priority'], 'task')).toEqual(['task', 'priority']);
    expect(getVisibleTaskTableColumns([]).map(column => column.key)).toEqual(['task']);
  });

  it('normalizes task table column widths', () => {
    expect(clampTaskTableColumnWidth(40)).toBe(72);
    expect(clampTaskTableColumnWidth(900)).toBe(520);
    expect(getTaskTableColumnWidth({ task: 240 }, 'task')).toBe(240);
    expect(getTaskTableColumnWidth({}, 'due')).toBe(142);
    expect(sanitizeTaskTableColumnWidths({ task: 40, due: 160.4, bad: 120, notes: 'wide' })).toEqual({
      task: 72,
      due: 160
    });
  });
});
