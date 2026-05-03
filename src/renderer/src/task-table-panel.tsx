import React from 'react';
import type { FlowTag, NodeId, NodeTask, TaskPriority } from '@shared/graph';
import {
  getTaskNodeLabel,
  getTaskTableDueStatus,
  getTaskTableColumnWidth,
  isTaskTableColumnHideable,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_TABLE_COLUMNS,
  TASK_TABLE_DENSITY_OPTIONS,
  TASK_TABLE_DUE_FILTERS,
  type TaskTableColumn,
  type TaskTableColumnKey,
  type TaskTableColumnWidthMap,
  type TaskTableDensity,
  type TaskTableFilters,
  type TaskTableRow,
  type TaskTableSort,
  type TaskTableSortKey
} from './task-table';

type TaskTablePanelProps = {
  expanded: boolean;
  density: TaskTableDensity;
  filters: TaskTableFilters;
  sort: TaskTableSort | undefined;
  rows: TaskTableRow[];
  sourceRows: TaskTableRow[];
  filterTagOptions: FlowTag[];
  filterAssigneeOptions: string[];
  visibleColumns: TaskTableColumn[];
  visibleColumnKeySet: Set<TaskTableColumnKey>;
  columnWidths: TaskTableColumnWidthMap;
  todayKey: string;
  hasQueryState: boolean;
  onSetFilter: (key: 'tagId' | 'assignee' | 'due', value: string) => void;
  onClearQueryState: () => void;
  onToggleSort: (key: TaskTableSortKey) => void;
  onToggleColumn: (key: TaskTableColumnKey) => void;
  onSetColumnWidths: (widths: TaskTableColumnWidthMap) => void;
  onSetDensity: (density: TaskTableDensity) => void;
  onToggleExpanded: () => void;
  onHide: () => void;
  onSelectNode: (nodeId: NodeId) => void;
  onUpdateTaskField: (nodeId: NodeId, patch: Partial<NodeTask>) => void;
};

export function TaskTablePanel({
  expanded,
  density,
  filters,
  sort,
  rows,
  sourceRows,
  filterTagOptions,
  filterAssigneeOptions,
  visibleColumns,
  visibleColumnKeySet,
  columnWidths,
  todayKey,
  hasQueryState,
  onSetFilter,
  onClearQueryState,
  onToggleSort,
  onToggleColumn,
  onSetColumnWidths,
  onSetDensity,
  onToggleExpanded,
  onHide,
  onSelectNode,
  onUpdateTaskField
}: TaskTablePanelProps) {
  return (
    <aside
      className={expanded ? 'outline-panel task-panel task-panel-expanded' : 'outline-panel task-panel'}
      data-testid="task-panel"
    >
      <div className="outline-panel-header">
        <span>Task Table</span>
        <div className="outline-panel-actions">
          <details className="task-column-menu">
            <summary className="outline-panel-action" data-testid="task-columns-toggle">
              Columns
            </summary>
            <div className="task-column-menu-panel" data-testid="task-columns-menu">
              {TASK_TABLE_COLUMNS.map(column => {
                const hideable = isTaskTableColumnHideable(column.key);
                return (
                  <label key={column.key} className="task-column-option">
                    <input
                      type="checkbox"
                      checked={visibleColumnKeySet.has(column.key)}
                      disabled={!hideable}
                      onChange={() => onToggleColumn(column.key)}
                    />
                    <span>{column.label}</span>
                  </label>
                );
              })}
            </div>
          </details>
          <select
            className="outline-panel-action task-density-select"
            data-testid="task-density"
            value={density}
            onChange={event => onSetDensity(event.currentTarget.value as TaskTableDensity)}
            aria-label="Task table density"
            title="Task table density"
          >
            {TASK_TABLE_DENSITY_OPTIONS.map(option => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="outline-panel-action"
            data-testid="task-expand-toggle"
            onClick={onToggleExpanded}
            title={expanded ? 'Collapse task table' : 'Expand task table'}
            aria-label={expanded ? 'Collapse task table' : 'Expand task table'}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button type="button" data-testid="task-hide" onClick={onHide} title="Hide task table">
            x
          </button>
        </div>
      </div>
      <TaskTableBody
        density={density}
        filters={filters}
        sort={sort}
        rows={rows}
        sourceRows={sourceRows}
        filterTagOptions={filterTagOptions}
        filterAssigneeOptions={filterAssigneeOptions}
        visibleColumns={visibleColumns}
        visibleColumnKeySet={visibleColumnKeySet}
        columnWidths={columnWidths}
        todayKey={todayKey}
        hasQueryState={hasQueryState}
        onSetFilter={onSetFilter}
        onClearQueryState={onClearQueryState}
        onToggleSort={onToggleSort}
        onSetColumnWidths={onSetColumnWidths}
        onSelectNode={onSelectNode}
        onUpdateTaskField={onUpdateTaskField}
      />
    </aside>
  );
}

function TaskTableBody({
  density,
  filters,
  sort,
  rows,
  sourceRows,
  filterTagOptions,
  filterAssigneeOptions,
  visibleColumns,
  visibleColumnKeySet,
  columnWidths,
  todayKey,
  hasQueryState,
  onSetFilter,
  onClearQueryState,
  onToggleSort,
  onSetColumnWidths,
  onSelectNode,
  onUpdateTaskField
}: Omit<TaskTablePanelProps, 'expanded' | 'onToggleColumn' | 'onSetDensity' | 'onToggleExpanded' | 'onHide'>) {
  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const hasCustomColumnWidths = visibleColumns.some(column => columnWidths[column.key] !== undefined);
  const tableWidth = hasCustomColumnWidths
    ? visibleColumns.reduce((total, column) => total + getTaskTableColumnWidth(columnWidths, column.key), 0)
    : undefined;

  const getMaterializedColumnWidths = () => {
    const widths: TaskTableColumnWidthMap = {};
    for (const column of visibleColumns) {
      const headerCell = tableRef.current?.querySelector<HTMLTableCellElement>(`th[data-column-key="${column.key}"]`);
      widths[column.key] = Math.round(
        headerCell?.getBoundingClientRect().width || getTaskTableColumnWidth(columnWidths, column.key)
      );
    }
    return widths;
  };

  const startColumnResize = (
    event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
    column: TaskTableColumn
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidths = getMaterializedColumnWidths();
    const startWidth = getTaskTableColumnWidth(startWidths, column.key);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    onSetColumnWidths(startWidths);

    const moveColumn = (clientX: number) => {
      onSetColumnWidths({
        ...startWidths,
        [column.key]: startWidth + clientX - startX
      });
    };
    const onPointerMove = (nativeEvent: PointerEvent) => moveColumn(nativeEvent.clientX);
    const onMouseMove = (nativeEvent: MouseEvent) => moveColumn(nativeEvent.clientX);
    const finishResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', finishResize);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', finishResize);
      document.removeEventListener('pointercancel', finishResize);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', finishResize);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', finishResize);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', finishResize);
    document.addEventListener('pointercancel', finishResize);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', finishResize);
  };

  const startColumnResizeFromHeaderEdge = (
    event: React.MouseEvent<HTMLTableCellElement> | React.PointerEvent<HTMLTableCellElement>,
    column: TaskTableColumn
  ) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.classList.contains('task-column-resizer') && event.clientX < rect.right - 10) return;
    startColumnResize(event, column);
  };

  return (
    <>
      <div className="task-table-filter-row">
        <label>
          <span>Tag</span>
          <select
            data-testid="task-filter-tag"
            value={filters.tagId || ''}
            onChange={event => onSetFilter('tagId', event.currentTarget.value)}
          >
            <option value="">All tags</option>
            {filterTagOptions.map(tag => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Assignee</span>
          <select
            data-testid="task-filter-assignee"
            value={filters.assignee || ''}
            onChange={event => onSetFilter('assignee', event.currentTarget.value)}
          >
            <option value="">All assignees</option>
            {filterAssigneeOptions.map(assignee => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Due</span>
          <select
            data-testid="task-filter-due"
            value={filters.due || ''}
            onChange={event => onSetFilter('due', event.currentTarget.value)}
          >
            <option value="">All due dates</option>
            {TASK_TABLE_DUE_FILTERS.map(option => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="task-table-filter-actions">
          <button
            type="button"
            data-testid="task-clear-query"
            onClick={onClearQueryState}
            disabled={!hasQueryState}
            title="Clear task filters and sort"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="task-table-scroll">
        {sourceRows.length === 0 ? (
          <p className="outline-empty">Tag outline nodes to create task table rows.</p>
        ) : rows.length === 0 ? (
          <p className="outline-empty">No task table rows match the current filters.</p>
        ) : (
          <table
            ref={tableRef}
            className={`task-table task-table-${density}`}
            style={tableWidth ? { width: tableWidth, minWidth: tableWidth } : undefined}
          >
            <colgroup>
              {visibleColumns.map(column => (
                <col
                  key={column.key}
                  className={`task-col-${column.key}`}
                  style={
                    columnWidths[column.key] !== undefined
                      ? { width: getTaskTableColumnWidth(columnWidths, column.key) }
                      : undefined
                  }
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                {visibleColumns.map(column => {
                  const active = sort?.key === column.key;
                  const direction = active ? sort.direction : undefined;
                  return (
                    <th
                      key={column.key}
                      data-column-key={column.key}
                      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      onMouseDownCapture={event => startColumnResizeFromHeaderEdge(event, column)}
                      onPointerDownCapture={event => {
                        if (event.pointerType !== 'mouse') startColumnResizeFromHeaderEdge(event, column);
                      }}
                    >
                      <button
                        type="button"
                        className="task-sort-button"
                        data-testid={`task-sort-${column.key}`}
                        onClick={() => onToggleSort(column.key)}
                      >
                        <span>{column.label}</span>
                        <span
                          className={active ? 'task-sort-indicator task-sort-indicator-active' : 'task-sort-indicator'}
                        >
                          {active ? (direction === 'asc' ? '^' : 'v') : ''}
                        </span>
                      </button>
                      <span
                        className="task-column-resizer"
                        data-testid={`task-resize-${column.key}`}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${column.label} column`}
                        onPointerDown={event => {
                          if (event.pointerType !== 'mouse') startColumnResize(event, column);
                        }}
                        onMouseDown={event => startColumnResize(event, column)}
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const task = row.node.task;
                const label = getTaskNodeLabel(row.node);
                const dueStatus = getTaskTableDueStatus(task?.dueDate, todayKey);

                return (
                  <tr key={row.node.id}>
                    {visibleColumnKeySet.has('task') ? (
                      <td>
                        <button type="button" className="task-node-link" onClick={() => onSelectNode(row.node.id)}>
                          {label}
                        </button>
                      </td>
                    ) : null}
                    {visibleColumnKeySet.has('category') ? (
                      <td className="task-readonly-cell">{row.category || '-'}</td>
                    ) : null}
                    {visibleColumnKeySet.has('priority') ? (
                      <td>
                        <select
                          value={task?.priority || ''}
                          onKeyDown={event => event.stopPropagation()}
                          onChange={event =>
                            onUpdateTaskField(row.node.id, {
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
                    ) : null}
                    {visibleColumnKeySet.has('progress') ? (
                      <td>
                        <input
                          className="task-progress-input"
                          type="number"
                          min={0}
                          max={100}
                          value={task?.progress ?? ''}
                          onKeyDown={event => event.stopPropagation()}
                          onChange={event =>
                            onUpdateTaskField(row.node.id, {
                              progress:
                                event.currentTarget.value === ''
                                  ? 0
                                  : Math.max(0, Math.min(100, Number(event.currentTarget.value)))
                            })
                          }
                        />
                      </td>
                    ) : null}
                    {visibleColumnKeySet.has('assignee') ? (
                      <td>
                        <input
                          value={task?.assignee || ''}
                          onKeyDown={event => event.stopPropagation()}
                          onChange={event =>
                            onUpdateTaskField(row.node.id, { assignee: event.currentTarget.value || undefined })
                          }
                        />
                      </td>
                    ) : null}
                    {visibleColumnKeySet.has('start') ? (
                      <td>
                        <input
                          type="date"
                          value={task?.startDate || ''}
                          onKeyDown={event => event.stopPropagation()}
                          onChange={event =>
                            onUpdateTaskField(row.node.id, { startDate: event.currentTarget.value || undefined })
                          }
                        />
                      </td>
                    ) : null}
                    {visibleColumnKeySet.has('due') ? (
                      <td className={dueStatus === 'none' ? undefined : `task-due-cell task-due-cell-${dueStatus}`}>
                        <input
                          aria-label={`Due date for ${label}`}
                          title={dueStatus === 'overdue' ? 'Overdue' : dueStatus === 'today' ? 'Due today' : 'Due date'}
                          type="date"
                          value={task?.dueDate || ''}
                          onKeyDown={event => event.stopPropagation()}
                          onChange={event =>
                            onUpdateTaskField(row.node.id, { dueDate: event.currentTarget.value || undefined })
                          }
                        />
                      </td>
                    ) : null}
                    {visibleColumnKeySet.has('tag') ? (
                      <td className="task-readonly-cell">{row.tagName || '-'}</td>
                    ) : null}
                    {visibleColumnKeySet.has('notes') ? (
                      <td>
                        <input
                          className="task-notes-input"
                          value={task?.note || ''}
                          onKeyDown={event => event.stopPropagation()}
                          onChange={event =>
                            onUpdateTaskField(row.node.id, { note: event.currentTarget.value || undefined })
                          }
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
