import type { FlowDoc, NodeId } from '../../shared/graph';
import type { NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';
import { getOrderedLayoutChildEdges, getPrimaryParentEdge } from './graph-analysis';
import { DEFAULT_NODE_SIZE } from './node-style';
import { getNodeCenter } from './edge-routing';

export type DirectionKey = 'arrowright' | 'arrowleft' | 'arrowdown' | 'arrowup';

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
