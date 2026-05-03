import type { FlowDoc, FlowEdge, NodeId } from '../../shared/graph';
import type { LayoutDirection, NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';
import { getLayerReorderPreview, type NodeOffsetMap } from '../../shared/local-reflow';
import { filterNodeBoxesByIds } from './edge-routing';
import { collectEdgeComponent } from './graph-analysis';
import type { NodeBox } from './routing-geometry';

export type CanvasSize = { width: number; height: number };
export type DragInsertPreviewRect = { left: number; top: number; width: number; height: number };
export type DragInsertPreviewState = {
  nodeIds: NodeId[];
  anchorNodeId: NodeId;
};
export type MarqueeRect = { startX: number; startY: number; currentX: number; currentY: number };

export function buildNodeBoxMap(
  nodes: Array<{ id: NodeId }>,
  renderedPositionMap: Map<NodeId, NodePosition>,
  nodeSizeMap: NodeSizeMap,
  defaultNodeSize: NodeSize
): Map<NodeId, NodeBox> {
  const map = new Map<NodeId, NodeBox>();
  for (const node of nodes) {
    const pos = renderedPositionMap.get(node.id);
    const size = nodeSizeMap[node.id] || defaultNodeSize;
    if (!pos) continue;
    map.set(node.id, {
      left: pos.x,
      right: pos.x + size.width,
      top: pos.y,
      bottom: pos.y + size.height
    });
  }
  return map;
}

export function buildRouteScopeNodeIdsByNodeId(doc: FlowDoc, layoutEdgeIds: Set<string>): Map<NodeId, NodeId[]> {
  const map = new Map<NodeId, NodeId[]>();
  for (const node of doc.nodes) {
    if (map.has(node.id)) continue;
    const componentNodeIds = collectEdgeComponent(doc, node.id, layoutEdgeIds);
    for (const componentNodeId of componentNodeIds) {
      map.set(componentNodeId, componentNodeIds);
    }
  }
  return map;
}

export function getScopedRouteNodeBoxes(
  edge: FlowEdge,
  nodeBoxMap: Map<NodeId, NodeBox>,
  routeScopeNodeIdsByNodeId: Map<NodeId, NodeId[]>
): Map<NodeId, NodeBox> {
  const componentNodeIds = new Set<NodeId>();
  for (const nodeId of routeScopeNodeIdsByNodeId.get(edge.from) || [edge.from]) {
    componentNodeIds.add(nodeId);
  }
  for (const nodeId of routeScopeNodeIdsByNodeId.get(edge.to) || [edge.to]) {
    componentNodeIds.add(nodeId);
  }
  const scopedNodeBoxes = filterNodeBoxesByIds(nodeBoxMap, componentNodeIds);
  return scopedNodeBoxes.size > 0 ? scopedNodeBoxes : nodeBoxMap;
}

export function getCanvasSize(
  nodes: Array<{ id: NodeId }>,
  renderedPositionMap: Map<NodeId, NodePosition>,
  nodeSizeMap: NodeSizeMap,
  defaultNodeSize: NodeSize,
  minSize: CanvasSize = { width: 980, height: 520 },
  padding = 120
): CanvasSize {
  let maxX = 0;
  let maxY = 0;
  for (const node of nodes) {
    const pos = renderedPositionMap.get(node.id);
    if (!pos) continue;
    const size = nodeSizeMap[node.id] || defaultNodeSize;
    maxX = Math.max(maxX, pos.x + size.width);
    maxY = Math.max(maxY, pos.y + size.height);
  }
  return {
    width: Math.max(minSize.width, maxX + padding),
    height: Math.max(minSize.height, maxY + padding)
  };
}

export function buildDragInsertPreviewRect(
  dragState: DragInsertPreviewState | null,
  basePositions: NodePosition[],
  offsets: NodeOffsetMap,
  renderedPositionMap: Map<NodeId, NodePosition>,
  nodeSizeMap: NodeSizeMap,
  defaultNodeSize: NodeSize,
  layoutDirection: LayoutDirection,
  secondaryGap: number
): DragInsertPreviewRect | null {
  if (!dragState) return null;
  const preview = getLayerReorderPreview(
    basePositions,
    offsets,
    dragState.nodeIds,
    dragState.anchorNodeId,
    layoutDirection,
    secondaryGap
  );
  if (!preview) return null;

  const layerIds = basePositions
    .filter(pos => (layoutDirection === 'horizontal' ? pos.x === preview.primary : pos.y === preview.primary))
    .map(pos => pos.id);
  if (layerIds.length === 0) return null;

  const extents = layerIds
    .map(id => {
      const rendered = renderedPositionMap.get(id);
      const size = nodeSizeMap[id] || defaultNodeSize;
      if (!rendered) return null;
      return {
        minX: rendered.x,
        maxX: rendered.x + size.width,
        minY: rendered.y,
        maxY: rendered.y + size.height
      };
    })
    .filter((item): item is { minX: number; maxX: number; minY: number; maxY: number } => item !== null);
  if (extents.length === 0) return null;

  const minX = Math.min(...extents.map(item => item.minX));
  const maxX = Math.max(...extents.map(item => item.maxX));
  const minY = Math.min(...extents.map(item => item.minY));
  const maxY = Math.max(...extents.map(item => item.maxY));

  return layoutDirection === 'horizontal'
    ? {
        left: minX - 8,
        top: preview.secondary - 1,
        width: Math.max(16, maxX - minX + 16),
        height: 2
      }
    : {
        left: preview.secondary - 1,
        top: minY - 8,
        width: 2,
        height: Math.max(16, maxY - minY + 16)
      };
}

export function getMarqueeSelectedNodeIds(
  marquee: MarqueeRect,
  nodes: Array<{ id: NodeId }>,
  renderedPositionMap: Map<NodeId, NodePosition>,
  nodeSizeMap: NodeSizeMap,
  defaultNodeSize: NodeSize
): NodeId[] {
  const left = Math.min(marquee.startX, marquee.currentX);
  const right = Math.max(marquee.startX, marquee.currentX);
  const top = Math.min(marquee.startY, marquee.currentY);
  const bottom = Math.max(marquee.startY, marquee.currentY);
  const hits: NodeId[] = [];
  for (const node of nodes) {
    const pos = renderedPositionMap.get(node.id);
    const nodeSize = nodeSizeMap[node.id] || defaultNodeSize;
    if (!pos) continue;
    const intersects =
      pos.x < right && pos.x + nodeSize.width > left && pos.y < bottom && pos.y + nodeSize.height > top;
    if (intersects) hits.push(node.id);
  }
  return hits;
}
