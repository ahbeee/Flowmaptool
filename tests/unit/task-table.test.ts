import { describe, expect, it } from 'vitest';
import type { FlowTag } from '../../src/shared/graph';
import type { OutlineTreeNode } from '../../src/renderer/src/outline';
import {
  buildTaskTableRows,
  DEFAULT_VISIBLE_TASK_TABLE_COLUMN_KEYS,
  getNextTaskTableSort,
  getNextVisibleTaskTableColumnKeys,
  getTaskNodeLabel,
  getVisibleTaskTableColumns,
  isTaskTableColumnHideable
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
            task: { enabled: true, done: false, priority: 'high', progress: 20, assignee: 'Zoe' }
          },
          children: []
        },
        {
          node: {
            id: 'n3',
            label: ' Alpha ',
            style: { tagId: 'tag-done' },
            task: { enabled: true, done: false, priority: 'low', progress: 90, assignee: 'Amy' }
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
});
