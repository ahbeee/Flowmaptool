import React from 'react';
import type { FlowTag, NodeId, TaskStatus } from '@shared/graph';
import {
  collectAncestorOutlineNodeIdsForTargets,
  collectCollapsibleOutlineNodeIds,
  filterOutlineTree,
  filterOutlineTreeByChecklistView,
  filterOutlineTreeByChecklistTargets,
  getOutlineChecklistCounts,
  type OutlineChecklistView,
  type OutlineMode,
  type OutlineTreeNode
} from './outline';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  getTaskDueRelativeLabel
} from './task-table';

type OutlinePanelProps = {
  outlineTree: OutlineTreeNode[];
  collapsedNodeIds: Set<NodeId>;
  selectedNodeIds: Set<NodeId>;
  todayKey: string;
  tagOptions: FlowTag[];
  tagById: Map<string, FlowTag>;
  checklistTargetsByNodeId: Map<NodeId, NodeId[]>;
  isChecklistNodeChecked: (nodeId: NodeId) => boolean;
  onToggleNode: (nodeId: NodeId) => void;
  onCollapseNodes: (nodeIds: NodeId[]) => void;
  onExpandAll: () => void;
  onToggleChecklistNodes: (nodeIds: NodeId[], checked: boolean) => void;
  onSelectNode: (nodeId: NodeId) => void;
  onRenameNode: (nodeId: NodeId, label: string) => void;
  onSetNodeTag: (nodeId: NodeId, tagId: string | undefined) => void;
  onSetNodeStatus: (nodeId: NodeId, status: TaskStatus) => void;
  onHide: () => void;
};

export function OutlinePanel({
  outlineTree,
  collapsedNodeIds,
  selectedNodeIds,
  todayKey,
  tagOptions,
  tagById,
  checklistTargetsByNodeId,
  isChecklistNodeChecked,
  onToggleNode,
  onCollapseNodes,
  onExpandAll,
  onToggleChecklistNodes,
  onSelectNode,
  onRenameNode,
  onSetNodeTag,
  onSetNodeStatus,
  onHide
}: OutlinePanelProps) {
  const [query, setQuery] = React.useState('');
  const [mode, setMode] = React.useState<OutlineMode>('outline');
  const [checklistView, setChecklistView] = React.useState<OutlineChecklistView>('all');
  const [autoRevealNodeIds, setAutoRevealNodeIds] = React.useState<Set<NodeId>>(() => new Set());
  const [editingNode, setEditingNode] = React.useState<{ nodeId: NodeId; label: string } | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{ nodeId: NodeId; x: number; y: number } | null>(null);
  const outlineRef = React.useRef<HTMLElement | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement | null>(null);
  const selectedNodeKey = React.useMemo(() => [...selectedNodeIds].sort().join('\n'), [selectedNodeIds]);
  const modeTree = React.useMemo(
    () =>
      mode === 'checklist' ? filterOutlineTreeByChecklistTargets(outlineTree, checklistTargetsByNodeId) : outlineTree,
    [checklistTargetsByNodeId, mode, outlineTree]
  );
  const checklistCounts = React.useMemo(
    () => getOutlineChecklistCounts(modeTree, checklistTargetsByNodeId, isChecklistNodeChecked),
    [checklistTargetsByNodeId, isChecklistNodeChecked, modeTree]
  );
  const checklistViewTree = React.useMemo(
    () =>
      mode === 'checklist'
        ? filterOutlineTreeByChecklistView(modeTree, checklistTargetsByNodeId, isChecklistNodeChecked, checklistView)
        : modeTree,
    [checklistTargetsByNodeId, checklistView, isChecklistNodeChecked, mode, modeTree]
  );
  const filteredOutline = React.useMemo(
    () => filterOutlineTree(checklistViewTree, query, tagById),
    [checklistViewTree, query, tagById]
  );
  const hasQuery = query.trim().length > 0;
  const visibleTree = filteredOutline.tree;
  const visibleCollapsibleNodeIds = React.useMemo(() => collectCollapsibleOutlineNodeIds(visibleTree), [visibleTree]);
  const selectedAncestorNodeIds = React.useMemo(
    () => collectAncestorOutlineNodeIdsForTargets(visibleTree, selectedNodeIds),
    [selectedNodeIds, selectedNodeKey, visibleTree]
  );
  const forcedExpandedNodeIds = React.useMemo(() => {
    const autoRevealAncestorNodeIds = collectAncestorOutlineNodeIdsForTargets(visibleTree, autoRevealNodeIds);
    return new Set([...filteredOutline.expandedNodeIds, ...autoRevealAncestorNodeIds]);
  }, [autoRevealNodeIds, filteredOutline.expandedNodeIds, visibleTree]);
  const hasCollapsibleNodes = visibleCollapsibleNodeIds.length > 0;
  const hasCollapsedVisibleNodes = visibleCollapsibleNodeIds.some(nodeId => collapsedNodeIds.has(nodeId));
  const emptyMessage =
    mode === 'checklist'
      ? checklistView === 'all'
        ? 'No checklist items. Apply tags to outline nodes to create checklist targets.'
        : `No ${checklistView} checklist items.`
      : 'No nodes';
  React.useEffect(() => {
    setAutoRevealNodeIds(new Set(selectedNodeIds));
  }, [selectedNodeKey]);
  React.useEffect(() => {
    const selectedOutlineNode = outlineRef.current?.querySelector('.outline-node-selected');
    selectedOutlineNode?.scrollIntoView({ block: 'nearest' });
  }, [forcedExpandedNodeIds, selectedNodeIds, selectedNodeKey, visibleTree]);
  React.useEffect(() => {
    if (!contextMenu) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  const contextNode = React.useMemo(() => {
    if (!contextMenu) return undefined;
    const findNode = (items: OutlineTreeNode[]): OutlineTreeNode | undefined => {
      for (const item of items) {
        if (item.node.id === contextMenu.nodeId) return item;
        const child = findNode(item.children);
        if (child) return child;
      }
      return undefined;
    };
    return findNode(outlineTree)?.node;
  }, [contextMenu, outlineTree]);

  const toggleNode = (nodeId: NodeId) => {
    setAutoRevealNodeIds(new Set());
    onToggleNode(nodeId);
  };

  const collapseVisibleNodes = () => {
    setAutoRevealNodeIds(new Set());
    onCollapseNodes(visibleCollapsibleNodeIds);
  };

  const startEditingNode = (nodeId: NodeId, label: string) => {
    setContextMenu(null);
    setEditingNode({ nodeId, label });
  };

  const commitOutlineEdit = () => {
    if (!editingNode) return;
    const label = editingNode.label.trim();
    setEditingNode(null);
    onRenameNode(editingNode.nodeId, label);
  };

  const cancelOutlineEdit = () => {
    setEditingNode(null);
  };

  const openContextMenu = (nodeId: NodeId, x: number, y: number) => {
    onSelectNode(nodeId);
    setContextMenu({ nodeId, x, y });
  };

  return (
    <aside ref={outlineRef} className="outline-panel" data-testid="outline-panel">
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
            onClick={collapseVisibleNodes}
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
      {mode === 'checklist' ? (
        <div className="outline-checklist-view-tabs" role="tablist" aria-label="Checklist view">
          {(['all', 'open', 'done'] as const).map(view => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={checklistView === view}
              className={
                checklistView === view
                  ? 'outline-checklist-view-tab outline-checklist-view-tab-active'
                  : 'outline-checklist-view-tab'
              }
              data-testid={`outline-checklist-view-${view}`}
              onClick={() => setChecklistView(view)}
            >
              <span>{view === 'all' ? 'All' : view === 'open' ? 'Open' : 'Done'}</span>
              <span className="outline-checklist-view-count" data-testid={`outline-checklist-view-${view}-count`}>
                {checklistCounts[view]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
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
            forcedExpandedNodeIds={forcedExpandedNodeIds}
            matchedNodeIds={filteredOutline.matchedNodeIds}
            selectedAncestorNodeIds={selectedAncestorNodeIds}
            editingNode={editingNode}
            searchActive={hasQuery}
            selectedNodeIds={selectedNodeIds}
            todayKey={todayKey}
            tagById={tagById}
            checklistTargetsByNodeId={checklistTargetsByNodeId}
            isChecklistNodeChecked={isChecklistNodeChecked}
            onToggleNode={toggleNode}
            onToggleChecklistNodes={onToggleChecklistNodes}
            onSelectNode={onSelectNode}
            onStartEditingNode={startEditingNode}
            onSetEditingLabel={label => editingNode && setEditingNode({ ...editingNode, label })}
            onCommitEditingNode={commitOutlineEdit}
            onCancelEditingNode={cancelOutlineEdit}
            onOpenContextMenu={openContextMenu}
          />
        ) : hasQuery ? (
          <p className="outline-empty" data-testid="outline-search-empty">
            No outline nodes match the search.
          </p>
        ) : (
          <p className="outline-empty">{emptyMessage}</p>
        )}
      </div>
      {contextMenu && contextNode ? (
        <div
          ref={contextMenuRef}
          className="outline-context-menu"
          data-testid="outline-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={event => event.preventDefault()}
        >
          <label>
            <span>Tag</span>
            <select
              data-testid="outline-context-tag"
              value={contextNode.style?.tagId || ''}
              onChange={event => onSetNodeTag(contextNode.id, event.currentTarget.value || undefined)}
            >
              <option value="">No tag</option>
              {tagOptions.map(tag => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              data-testid="outline-context-status"
              value={contextNode.task?.status || ''}
              onChange={event => onSetNodeStatus(contextNode.id, event.currentTarget.value as TaskStatus)}
            >
              <option value="" disabled>
                Set status
              </option>
              {TASK_STATUSES.map(status => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </aside>
  );
}

type OutlineNodesProps = Omit<
  OutlinePanelProps,
  | 'outlineTree'
  | 'tagOptions'
  | 'onHide'
  | 'onCollapseNodes'
  | 'onExpandAll'
  | 'onRenameNode'
  | 'onSetNodeTag'
  | 'onSetNodeStatus'
> & {
  items: OutlineTreeNode[];
  forcedExpandedNodeIds: Set<NodeId>;
  matchedNodeIds: Set<NodeId>;
  selectedAncestorNodeIds: Set<NodeId>;
  editingNode: { nodeId: NodeId; label: string } | null;
  searchActive: boolean;
  depth?: number;
  todayKey: string;
  onStartEditingNode: (nodeId: NodeId, label: string) => void;
  onSetEditingLabel: (label: string) => void;
  onCommitEditingNode: () => void;
  onCancelEditingNode: () => void;
  onOpenContextMenu: (nodeId: NodeId, x: number, y: number) => void;
};

function OutlineNodes({
  items,
  depth = 0,
  collapsedNodeIds,
  forcedExpandedNodeIds,
  matchedNodeIds,
  selectedAncestorNodeIds,
  editingNode,
  searchActive,
  selectedNodeIds,
  todayKey,
  tagById,
  checklistTargetsByNodeId,
  isChecklistNodeChecked,
  onToggleNode,
  onToggleChecklistNodes,
  onSelectNode,
  onStartEditingNode,
  onSetEditingLabel,
  onCommitEditingNode,
  onCancelEditingNode,
  onOpenContextMenu
}: OutlineNodesProps): React.ReactNode {
  return items.map(item => {
    const hasChildren = item.children.length > 0;
    const collapsed = collapsedNodeIds.has(item.node.id) && !forcedExpandedNodeIds.has(item.node.id);
    const selected = selectedNodeIds.has(item.node.id);
    const selectedAncestor = selectedAncestorNodeIds.has(item.node.id);
    const editing = editingNode?.nodeId === item.node.id;
    const matched = matchedNodeIds.has(item.node.id);
    const label = item.node.label.trim() || 'Untitled Node';
    const tag = item.node.style?.tagId ? tagById.get(item.node.style.tagId) : undefined;
    const displayLabel = `${label}${tag ? ` [${tag.name}]` : ''}`;
    const task = item.node.task?.enabled ? item.node.task : undefined;
    const dueLabel = getTaskDueRelativeLabel(task?.dueDate, todayKey);
    const checklistTargets = checklistTargetsByNodeId.get(item.node.id) || [];
    const checkedTargetCount = checklistTargets.filter(isChecklistNodeChecked).length;
    const canCheck = checklistTargets.length > 0;
    const checked = canCheck && checkedTargetCount === checklistTargets.length;
    const indeterminate = canCheck && checkedTargetCount > 0 && checkedTargetCount < checklistTargets.length;
    const nodeButtonClassName = [
      'outline-node-button',
      selected ? 'outline-node-selected' : '',
      selectedAncestor ? 'outline-node-ancestor' : '',
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
          {editing ? (
            <input
              className="outline-node-edit-input"
              data-testid={`outline-edit-${item.node.id}`}
              value={editingNode.label}
              autoFocus
              onFocus={event => event.currentTarget.select()}
              onChange={event => onSetEditingLabel(event.currentTarget.value)}
              onBlur={onCommitEditingNode}
              onKeyDown={event => {
                if (event.key === 'Enter') onCommitEditingNode();
                if (event.key === 'Escape') onCancelEditingNode();
              }}
            />
          ) : (
            <button
              type="button"
              className={nodeButtonClassName}
              data-testid={`outline-node-${item.node.id}`}
              onClick={() => onSelectNode(item.node.id)}
              onDoubleClick={() => onStartEditingNode(item.node.id, label)}
              onContextMenu={event => {
                event.preventDefault();
                onOpenContextMenu(item.node.id, event.clientX, event.clientY);
              }}
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
                {task && TASK_PRIORITIES.includes(task.priority) && task.priority !== 'normal' ? (
                  <span
                    className={`outline-node-badge outline-node-priority-badge outline-node-priority-${task.priority}`}
                  >
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </span>
                ) : null}
                {task?.assignee ? <span className="outline-node-badge">{task.assignee}</span> : null}
                {task?.dueDate && dueLabel ? (
                  <span className="outline-node-badge outline-node-due-badge" title={`Due ${task.dueDate}`}>
                    {dueLabel}
                  </span>
                ) : null}
                {canCheck ? (
                  <span className="outline-node-badge outline-node-progress-badge">
                    {checkedTargetCount}/{checklistTargets.length}
                  </span>
                ) : null}
              </span>
            </button>
          )}
        </div>
        {hasChildren && !collapsed ? (
          <OutlineNodes
            items={item.children}
            depth={depth + 1}
            collapsedNodeIds={collapsedNodeIds}
            forcedExpandedNodeIds={forcedExpandedNodeIds}
            matchedNodeIds={matchedNodeIds}
            selectedAncestorNodeIds={selectedAncestorNodeIds}
            editingNode={editingNode}
            searchActive={searchActive}
            selectedNodeIds={selectedNodeIds}
            todayKey={todayKey}
            tagById={tagById}
            checklistTargetsByNodeId={checklistTargetsByNodeId}
            isChecklistNodeChecked={isChecklistNodeChecked}
            onToggleNode={onToggleNode}
            onToggleChecklistNodes={onToggleChecklistNodes}
            onSelectNode={onSelectNode}
            onStartEditingNode={onStartEditingNode}
            onSetEditingLabel={onSetEditingLabel}
            onCommitEditingNode={onCommitEditingNode}
            onCancelEditingNode={onCancelEditingNode}
            onOpenContextMenu={onOpenContextMenu}
          />
        ) : null}
      </React.Fragment>
    );
  });
}
