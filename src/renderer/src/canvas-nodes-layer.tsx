import React from 'react';
import type { EdgeAnchors, FlowNode, FlowTag, NodeId, NodeStyle } from '@shared/graph';
import type { NodePosition, NodeSize, NodeSizeMap } from '@shared/layout';
import type { LayoutDirection } from '@shared/layout';
import { FRONT_HANDLE_CONNECT_ANCHORS } from './connect-anchors';
import type { LayoutPoint } from './edge-routing';

type CanvasNodesLayerProps = {
  positions: NodePosition[];
  nodeById: Map<NodeId, FlowNode>;
  tags: FlowTag[];
  renderedPositionMap: Map<NodeId, LayoutPoint>;
  nodeSizeMap: NodeSizeMap;
  defaultNodeSize: NodeSize;
  selectedNodeIds: NodeId[];
  editingNodeId: NodeId | null;
  editingLabel: string;
  layoutDirection: LayoutDirection;
  connectHandleVisible: boolean;
  dropParentTargetId: NodeId | null;
  hoverTargetNodeId: NodeId | null | undefined;
  getNodeVisualStyle: (nodeId: NodeId, style?: NodeStyle) => React.CSSProperties;
  onNodePointerDown: (event: React.PointerEvent<HTMLButtonElement>, nodeId: NodeId) => void;
  onNodeMouseUp: (event: React.MouseEvent<HTMLButtonElement>, nodeId: NodeId) => void;
  onNodeContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onStartEditingNode: (nodeId: NodeId) => void;
  onUpdateEditingLabel: (value: string) => void;
  onCommitEditingNode: () => void;
  onCancelEditingNode: () => void;
  onStartConnectDrag: (event: React.PointerEvent<HTMLElement>, nodeId: NodeId, anchors?: EdgeAnchors) => void;
};

export function CanvasNodesLayer({
  positions,
  nodeById,
  tags,
  renderedPositionMap,
  nodeSizeMap,
  defaultNodeSize,
  selectedNodeIds,
  editingNodeId,
  editingLabel,
  layoutDirection,
  connectHandleVisible,
  dropParentTargetId,
  hoverTargetNodeId,
  getNodeVisualStyle,
  onNodePointerDown,
  onNodeMouseUp,
  onNodeContextMenu,
  onStartEditingNode,
  onUpdateEditingLabel,
  onCommitEditingNode,
  onCancelEditingNode,
  onStartConnectDrag
}: CanvasNodesLayerProps) {
  const selectedNodeIdSet = React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  return (
    <>
      {positions.map(pos => {
        const node = nodeById.get(pos.id);
        if (!node) return null;
        const rendered = renderedPositionMap.get(node.id) || pos;
        const nodeSize = nodeSizeMap[node.id] || defaultNodeSize;
        const selected = selectedNodeIdSet.has(node.id);
        const editing = editingNodeId === node.id;
        const nodeTag = node.style?.tagId ? tags.find(tag => tag.id === node.style?.tagId) : undefined;
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
            data-drop-target={dropParentTargetId === node.id || hoverTargetNodeId === node.id ? 'true' : undefined}
            data-tag-name={nodeTag?.name || undefined}
            style={{
              left: rendered.x,
              top: rendered.y,
              width: nodeSize.width,
              height: nodeSize.height,
              ...getNodeVisualStyle(node.id, node.style)
            }}
            data-testid={`node-${node.id}`}
            type="button"
            onPointerDown={event => onNodePointerDown(event, node.id)}
            onMouseUp={event => onNodeMouseUp(event, node.id)}
            onContextMenu={onNodeContextMenu}
            onDoubleClick={() => onStartEditingNode(node.id)}
          >
            {editing ? (
              <input
                className="node-label-input"
                value={editingLabel}
                onInput={event => onUpdateEditingLabel(event.currentTarget.value)}
                onCompositionUpdate={event => onUpdateEditingLabel(event.currentTarget.value)}
                onCompositionEnd={event => onUpdateEditingLabel(event.currentTarget.value)}
                onChange={event => onUpdateEditingLabel(event.currentTarget.value)}
                onBlur={onCommitEditingNode}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCommitEditingNode();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    onCancelEditingNode();
                  }
                }}
                autoFocus
              />
            ) : (
              <div className="node-label">{node.label}</div>
            )}
            {nodeTag ? (
              <span className="node-tag-marker" style={{ backgroundColor: nodeTag.color }} aria-label={nodeTag.name} />
            ) : null}
            <span
              className={
                layoutDirection === 'horizontal'
                  ? 'node-connect-handle-front'
                  : 'node-connect-handle-front node-connect-handle-front-vertical'
              }
              title="Drag from input side"
              onPointerDown={event => onStartConnectDrag(event, node.id, FRONT_HANDLE_CONNECT_ANCHORS)}
              onContextMenu={event => event.preventDefault()}
            />
            <span
              className={
                layoutDirection === 'horizontal'
                  ? 'node-connect-handle'
                  : 'node-connect-handle node-connect-handle-vertical'
              }
              title="Drag to connect"
              onPointerDown={event => onStartConnectDrag(event, node.id)}
              onContextMenu={event => event.preventDefault()}
            />
          </button>
        );
      })}
    </>
  );
}
