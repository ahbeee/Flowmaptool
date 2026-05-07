import React from 'react';
import type { FlowTag, NodeId } from '@shared/graph';
import {
  collectCollapsibleOutlineNodeIds,
  filterOutlineTree,
  filterOutlineTreeByChecklistTargets,
  type OutlineMode,
  type OutlineTreeNode
} from './outline';
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from './task-table';

type OutlinePanelProps = {
  outlineTree: OutlineTreeNode[];
  collapsedNodeIds: Set<NodeId>;
  selectedNodeIds: Set<NodeId>;
  tagById: Map<string, FlowTag>;
  checklistTargetsByNodeId: Map<NodeId, NodeId[]>;
  isChecklistNodeChecked: (nodeId: NodeId) => boolean;
  onToggleNode: (nodeId: NodeId) => void;
  onCollapseNodes: (nodeIds: NodeId[]) => void;
  onExpandAll: () => void;
  onToggleChecklistNodes: (nodeIds: NodeId[], checked: boolean) => void;
  onSelectNode: (nodeId: NodeId) => void;
  onHide: () => void;
};

export function OutlinePanel({
  outlineTree,
  collapsedNodeIds,
  selectedNodeIds,
  tagById,
  checklistTargetsByNodeId,
  isChecklistNodeChecked,
  onToggleNode,
  onCollapseNodes,
  onExpandAll,
  onToggleChecklistNodes,
  onSelectNode,
  onHide
}: OutlinePanelProps) {
  const [query, setQuery] = React.useState('');
  const [mode, setMode] = React.useState<OutlineMode>('outline');
  const modeTree = React.useMemo(
    () =>
      mode === 'checklist' ? filterOutlineTreeByChecklistTargets(outlineTree, checklistTargetsByNodeId) : outlineTree,
    [checklistTargetsByNodeId, mode, outlineTree]
  );
  const filteredOutline = React.useMemo(() => filterOutlineTree(modeTree, query, tagById), [modeTree, query, tagById]);
  const hasQuery = query.trim().length > 0;
  const visibleTree = filteredOutline.tree;
  const visibleCollapsibleNodeIds = React.useMemo(() => collectCollapsibleOutlineNodeIds(visibleTree), [visibleTree]);
  const hasCollapsibleNodes = visibleCollapsibleNodeIds.length > 0;
  const hasCollapsedVisibleNodes = visibleCollapsibleNodeIds.some(nodeId => collapsedNodeIds.has(nodeId));
  const emptyMessage =
    mode === 'checklist' ? 'No checklist items. Apply tags to outline nodes to create checklist targets.' : 'No nodes';
  return (
    <aside className="outline-panel" data-testid="outline-panel">
      <div className="outline-panel-header">
        <span>{mode === 'checklist' ? 'Checklist' : 'Outline'}</span>
        <div className="outline-panel-actions">
          <button
            type="button"
            className="outline-panel-action"
            data-testid="outline-expand-all"
            onClick={onExpandAll}
            disabled={!hasCollapsedVisibleNodes}
            title="Expand all outline branches"
          >
            Expand
          </button>
          <button
            type="button"
            className="outline-panel-action"
            data-testid="outline-collapse-all"
            onClick={() => onCollapseNodes(visibleCollapsibleNodeIds)}
            disabled={!hasCollapsibleNodes}
            title="Collapse all visible outline branches"
          >
            Collapse
          </button>
          <button type="button" data-testid="outline-hide" onClick={onHide} title="Hide outline">
            x
          </button>
        </div>
      </div>
      <div className="outline-mode-tabs" role="tablist" aria-label="Outline mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'outline'}
          className={mode === 'outline' ? 'outline-mode-tab outline-mode-tab-active' : 'outline-mode-tab'}
          data-testid="outline-mode-outline"
          onClick={() => setMode('outline')}
        >
          Outline
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'checklist'}
          className={mode === 'checklist' ? 'outline-mode-tab outline-mode-tab-active' : 'outline-mode-tab'}
          data-testid="outline-mode-checklist"
          onClick={() => setMode('checklist')}
        >
          Checklist
        </button>
      </div>
      <div className="outline-search">
        <input
          data-testid="outline-search"
          value={query}
          onChange={event => setQuery(event.currentTarget.value)}
          placeholder="Search outline"
          aria-label="Search outline"
        />
        <button type="button" data-testid="outline-clear-search" onClick={() => setQuery('')} disabled={!hasQuery}>
          Clear
        </button>
      </div>
      <div className="outline-tree">
        {visibleTree.length > 0 ? (
          <OutlineNodes
            items={visibleTree}
            collapsedNodeIds={collapsedNodeIds}
            forcedExpandedNodeIds={filteredOutline.expandedNodeIds}
            matchedNodeIds={filteredOutline.matchedNodeIds}
            searchActive={hasQuery}
            selectedNodeIds={selectedNodeIds}
            tagById={tagById}
            checklistTargetsByNodeId={checklistTargetsByNodeId}
            isChecklistNodeChecked={isChecklistNodeChecked}
            onToggleNode={onToggleNode}
            onToggleChecklistNodes={onToggleChecklistNodes}
            onSelectNode={onSelectNode}
          />
        ) : hasQuery ? (
          <p className="outline-empty" data-testid="outline-search-empty">
            No outline nodes match the search.
          </p>
        ) : (
          <p className="outline-empty">{emptyMessage}</p>
        )}
      </div>
    </aside>
  );
}

type OutlineNodesProps = Omit<OutlinePanelProps, 'outlineTree' | 'onHide' | 'onCollapseNodes' | 'onExpandAll'> & {
  items: OutlineTreeNode[];
  forcedExpandedNodeIds: Set<NodeId>;
  matchedNodeIds: Set<NodeId>;
  searchActive: boolean;
  depth?: number;
};

function OutlineNodes({
  items,
  depth = 0,
  collapsedNodeIds,
  forcedExpandedNodeIds,
  matchedNodeIds,
  searchActive,
  selectedNodeIds,
  tagById,
  checklistTargetsByNodeId,
  isChecklistNodeChecked,
  onToggleNode,
  onToggleChecklistNodes,
  onSelectNode
}: OutlineNodesProps): React.ReactNode {
  return items.map(item => {
    const hasChildren = item.children.length > 0;
    const collapsed = collapsedNodeIds.has(item.node.id) && !forcedExpandedNodeIds.has(item.node.id);
    const selected = selectedNodeIds.has(item.node.id);
    const matched = matchedNodeIds.has(item.node.id);
    const label = item.node.label.trim() || 'Untitled Node';
    const tag = item.node.style?.tagId ? tagById.get(item.node.style.tagId) : undefined;
    const displayLabel = `${label}${tag ? ` [${tag.name}]` : ''}`;
    const task = item.node.task?.enabled ? item.node.task : undefined;
    const checklistTargets = checklistTargetsByNodeId.get(item.node.id) || [];
    const checkedTargetCount = checklistTargets.filter(isChecklistNodeChecked).length;
    const canCheck = checklistTargets.length > 0;
    const checked = canCheck && checkedTargetCount === checklistTargets.length;
    const indeterminate = canCheck && checkedTargetCount > 0 && checkedTargetCount < checklistTargets.length;
    const nodeButtonClassName = [
      'outline-node-button',
      selected ? 'outline-node-selected' : '',
      matched ? 'outline-node-match' : '',
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
            onClick={() => onToggleNode(item.node.id)}
            title={searchActive ? 'Search results are expanded' : collapsed ? 'Expand' : 'Collapse'}
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
              onChange={event => onToggleChecklistNodes(checklistTargets, event.currentTarget.checked)}
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
            onClick={() => onSelectNode(item.node.id)}
            title={displayLabel}
          >
            <span className="outline-node-label">{label}</span>
            <span className="outline-node-badges" aria-label={`Metadata for ${displayLabel}`}>
              {tag ? (
                <span className="outline-node-badge outline-node-tag-badge" style={{ borderColor: tag.color }}>
                  <span className="outline-node-tag-dot" style={{ backgroundColor: tag.color }} aria-hidden="true" />
                  {tag.name}
                </span>
              ) : null}
              {task ? (
                <span className={`outline-node-badge outline-node-status-badge outline-node-status-${task.status}`}>
                  {TASK_STATUS_LABELS[task.status]}
                </span>
              ) : null}
              {task && task.priority !== 'normal' ? (
                <span
                  className={`outline-node-badge outline-node-priority-badge outline-node-priority-${task.priority}`}
                >
                  {TASK_PRIORITY_LABELS[task.priority]}
                </span>
              ) : null}
              {task?.assignee ? <span className="outline-node-badge">{task.assignee}</span> : null}
              {task?.dueDate ? (
                <span className="outline-node-badge outline-node-due-badge">Due {task.dueDate}</span>
              ) : null}
              {canCheck ? (
                <span className="outline-node-badge outline-node-progress-badge">
                  {checkedTargetCount}/{checklistTargets.length}
                </span>
              ) : null}
            </span>
          </button>
        </div>
        {hasChildren && !collapsed ? (
          <OutlineNodes
            items={item.children}
            depth={depth + 1}
            collapsedNodeIds={collapsedNodeIds}
            forcedExpandedNodeIds={forcedExpandedNodeIds}
            matchedNodeIds={matchedNodeIds}
            searchActive={searchActive}
            selectedNodeIds={selectedNodeIds}
            tagById={tagById}
            checklistTargetsByNodeId={checklistTargetsByNodeId}
            isChecklistNodeChecked={isChecklistNodeChecked}
            onToggleNode={onToggleNode}
            onToggleChecklistNodes={onToggleChecklistNodes}
            onSelectNode={onSelectNode}
          />
        ) : null}
      </React.Fragment>
    );
  });
}
