import type { NodeId } from '../../shared/graph';

export type NodePointerDownPlan =
  | { type: 'ignore' }
  | { type: 'right-connect'; nodeId: NodeId; anchor: 'front' | 'back' }
  | { type: 'right-select'; nodeId: NodeId; nextSelection: NodeId[] }
  | { type: 'shift-connect'; fromNodeId: NodeId | null; targetNodeId: NodeId; nextSelection: NodeId[] }
  | { type: 'toggle-selection'; nextSelection: NodeId[] }
  | { type: 'select-and-drag'; nodeId: NodeId; nextSelection: NodeId[] };

export function toggleNodeSelection(selectedNodeIds: NodeId[], nodeId: NodeId): NodeId[] {
  return selectedNodeIds.includes(nodeId) ? selectedNodeIds.filter(id => id !== nodeId) : [...selectedNodeIds, nodeId];
}

export function planNodePointerDown(options: {
  button: number;
  nodeId: NodeId;
  selectedNodeIds: NodeId[];
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  handleAnchor?: 'front' | 'back' | null;
}): NodePointerDownPlan {
  const { button, nodeId, selectedNodeIds, shiftKey, ctrlKey, metaKey, handleAnchor } = options;

  if (button === 2) {
    if (handleAnchor) return { type: 'right-connect', nodeId, anchor: handleAnchor };
    return { type: 'right-select', nodeId, nextSelection: [nodeId] };
  }

  if (button !== 0) return { type: 'ignore' };

  if (shiftKey) {
    const fromNodeId = selectedNodeIds.length === 1 && selectedNodeIds[0] !== nodeId ? selectedNodeIds[0] : null;
    return { type: 'shift-connect', fromNodeId, targetNodeId: nodeId, nextSelection: [nodeId] };
  }

  if (ctrlKey || metaKey) {
    return { type: 'toggle-selection', nextSelection: toggleNodeSelection(selectedNodeIds, nodeId) };
  }

  return { type: 'select-and-drag', nodeId, nextSelection: [nodeId] };
}
