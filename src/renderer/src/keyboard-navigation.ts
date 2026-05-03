import type { FlowDoc, NodeId } from '../../shared/graph';
import type { NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';
import { getOrderedLayoutChildEdges, getPrimaryParentEdge } from './graph-analysis';
import { DEFAULT_NODE_SIZE } from './node-style';
import { getNodeCenter } from './edge-routing';

export type DirectionKey = 'arrowright' | 'arrowleft' | 'arrowdown' | 'arrowup';
export type KeyboardShortcutAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'new-document' }
  | { type: 'open-document' }
  | { type: 'save-document'; saveAs: boolean }
  | { type: 'fit-canvas' }
  | { type: 'copy-selection' }
  | { type: 'paste-selection' }
  | { type: 'create-linked-node' }
  | { type: 'create-sibling-node' }
  | { type: 'reorder-sibling'; direction: -1 | 1 }
  | { type: 'select-node-by-direction'; directionKey: DirectionKey }
  | { type: 'delete-edge' }
  | { type: 'delete-nodes' }
  | { type: 'edit-node'; nodeId: NodeId };

export type KeyboardShortcutContext = {
  selectedNodeIds: NodeId[];
  selectedEdgeId: string;
  inEditor: boolean;
};

export type KeyboardShortcutInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable === true
  );
}

function isDirectionKey(key: string): key is DirectionKey {
  return key === 'arrowright' || key === 'arrowleft' || key === 'arrowdown' || key === 'arrowup';
}

export function getKeyboardShortcutAction(
  input: KeyboardShortcutInput,
  context: KeyboardShortcutContext
): KeyboardShortcutAction | null {
  const key = input.key.toLowerCase();
  const mod = input.ctrlKey === true || input.metaKey === true;
  const shift = input.shiftKey === true;

  if (mod && key === 'z' && !shift) return { type: 'undo' };
  if (mod && ((key === 'z' && shift) || key === 'y')) return { type: 'redo' };
  if (mod && key === 'n') return { type: 'new-document' };
  if (mod && key === 'o') return { type: 'open-document' };
  if (mod && key === 's') return { type: 'save-document', saveAs: shift };
  if (mod && key === '0') return { type: 'fit-canvas' };

  if (context.inEditor) return null;

  const selectedNodeCount = context.selectedNodeIds.length;
  if (mod && key === 'c') return { type: 'copy-selection' };
  if (mod && key === 'v') return { type: 'paste-selection' };
  if (key === 'tab' && selectedNodeCount === 1) return { type: 'create-linked-node' };
  if (key === 'enter' && selectedNodeCount === 1) return { type: 'create-sibling-node' };
  if (mod && selectedNodeCount === 1 && (key === 'arrowup' || key === 'arrowdown')) {
    return { type: 'reorder-sibling', direction: key === 'arrowdown' ? 1 : -1 };
  }
  if (selectedNodeCount > 0 && isDirectionKey(key)) {
    return { type: 'select-node-by-direction', directionKey: key };
  }
  if (key === 'delete' || key === 'backspace') {
    if (context.selectedEdgeId) return { type: 'delete-edge' };
    if (selectedNodeCount > 0) return { type: 'delete-nodes' };
  }
  if (key === ' ' && selectedNodeCount === 1) {
    return { type: 'edit-node', nodeId: context.selectedNodeIds[0] };
  }

  return null;
}

export function getNodeSelectionByDirection(
  nodes: Array<{ id: NodeId }>,
  selectedNodeId: NodeId,
  directionKey: string,
  renderedPositionMap: Map<NodeId, NodePosition>,
  nodeSizeMap: NodeSizeMap,
  defaultNodeSize: NodeSize = DEFAULT_NODE_SIZE
): NodeId | null {
  const selectedPos = renderedPositionMap.get(selectedNodeId);
  if (!selectedPos) return null;
  const selectedSize = nodeSizeMap[selectedNodeId] || defaultNodeSize;
  const selectedCenter = getNodeCenter(selectedPos.x, selectedPos.y, selectedSize);
  const candidates = nodes
    .filter(node => node.id !== selectedNodeId)
    .map(node => {
      const pos = renderedPositionMap.get(node.id);
      if (!pos) return null;
      const size = nodeSizeMap[node.id] || defaultNodeSize;
      const center = getNodeCenter(pos.x, pos.y, size);
      const dx = center.x - selectedCenter.x;
      const dy = center.y - selectedCenter.y;
      let primaryDelta = 0;
      let secondaryDelta = 0;
      if (directionKey === 'arrowright') {
        if (dx <= 0) return null;
        primaryDelta = dx;
        secondaryDelta = Math.abs(dy);
      } else if (directionKey === 'arrowleft') {
        if (dx >= 0) return null;
        primaryDelta = Math.abs(dx);
        secondaryDelta = Math.abs(dy);
      } else if (directionKey === 'arrowdown') {
        if (dy <= 0) return null;
        primaryDelta = dy;
        secondaryDelta = Math.abs(dx);
      } else if (directionKey === 'arrowup') {
        if (dy >= 0) return null;
        primaryDelta = Math.abs(dy);
        secondaryDelta = Math.abs(dx);
      } else {
        return null;
      }
      return {
        nodeId: node.id,
        score: secondaryDelta * 1000 + primaryDelta
      };
    })
    .filter((entry): entry is { nodeId: NodeId; score: number } => Boolean(entry))
    .sort((a, b) => a.score - b.score || a.nodeId.localeCompare(b.nodeId));

  return candidates[0]?.nodeId || null;
}

export function reorderSelectedNodeSibling(doc: FlowDoc, selectedNodeId: NodeId, direction: -1 | 1): FlowDoc {
  const parentEdge = getPrimaryParentEdge(doc, selectedNodeId);
  if (!parentEdge) return doc;
  const siblings = getOrderedLayoutChildEdges(doc, parentEdge.from);
  const selectedIndex = siblings.findIndex(edge => edge.id === parentEdge.id);
  const targetIndex = selectedIndex + direction;
  if (selectedIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return doc;

  const siblingOrderById = new Map<string, number>();
  siblings.forEach((edge, index) => {
    siblingOrderById.set(edge.id, typeof edge.order === 'number' ? edge.order : index + 1);
  });
  const selectedOrder = siblingOrderById.get(siblings[selectedIndex].id)!;
  const targetOrder = siblingOrderById.get(siblings[targetIndex].id)!;
  siblingOrderById.set(siblings[selectedIndex].id, targetOrder);
  siblingOrderById.set(siblings[targetIndex].id, selectedOrder);

  return {
    ...doc,
    edges: doc.edges.map(edge =>
      siblingOrderById.has(edge.id) ? { ...edge, order: siblingOrderById.get(edge.id)! } : edge
    )
  };
}
