import type { FlowDoc, FlowEdge, NodeId } from '../../shared/graph';
import type { NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';
import { filterNodeBoxesByIds } from './edge-routing';
import { collectEdgeComponent } from './graph-analysis';
import type { NodeBox } from './routing-geometry';

export type CanvasSize = { width: number; height: number };

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
