import type { FlowNode, NodeId } from '../../shared/graph';
import type { NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';

export type ViewportSize = {
  clientWidth: number;
  clientHeight: number;
};

export type ScrollSize = {
  scrollWidth: number;
  scrollHeight: number;
};

export type ScrollTarget = {
  left: number;
  top: number;
};

export type CanvasFitPlan = {
  zoom: number;
  center: { x: number; y: number };
};

export type CanvasWheelZoomPlan = {
  zoom: number;
  scroll: ScrollTarget;
};

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getRenderedNodeBounds(
  nodes: FlowNode[],
  renderedPositionMap: Map<NodeId, NodePosition>,
  nodeSizeMap: NodeSizeMap,
  defaultNodeSize: NodeSize
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const pos = renderedPositionMap.get(node.id);
    if (!pos) continue;
    const size = nodeSizeMap[node.id] || defaultNodeSize;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + size.width);
    maxY = Math.max(maxY, pos.y + size.height);
  }
  return Number.isFinite(minX) && Number.isFinite(minY) ? { minX, minY, maxX, maxY } : null;
}

export function planCanvasFitToView(
  nodes: FlowNode[],
  renderedPositionMap: Map<NodeId, NodePosition>,
  nodeSizeMap: NodeSizeMap,
  defaultNodeSize: NodeSize,
  viewport: ViewportSize,
  padding = 96
): CanvasFitPlan | null {
  if (nodes.length === 0) return null;
  const bounds = getRenderedNodeBounds(nodes, renderedPositionMap, nodeSizeMap, defaultNodeSize);
  if (!bounds) return null;
  const boundsWidth = Math.max(1, bounds.maxX - bounds.minX + padding * 2);
  const boundsHeight = Math.max(1, bounds.maxY - bounds.minY + padding * 2);
  return {
    zoom: clampValue(
      Number(Math.min(viewport.clientWidth / boundsWidth, viewport.clientHeight / boundsHeight, 1.25).toFixed(2)),
      0.5,
      2.5
    ),
    center: {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    }
  };
}

export function getCenteredScrollTarget(
  center: { x: number; y: number },
  zoom: number,
  viewport: ViewportSize,
  scrollSize: ScrollSize
): ScrollTarget {
  const maxScrollLeft = Math.max(0, scrollSize.scrollWidth - viewport.clientWidth);
  const maxScrollTop = Math.max(0, scrollSize.scrollHeight - viewport.clientHeight);
  return {
    left: clampValue(center.x * zoom - viewport.clientWidth / 2, 0, maxScrollLeft),
    top: clampValue(center.y * zoom - viewport.clientHeight / 2, 0, maxScrollTop)
  };
}

export function getNodeScrollTarget(
  rendered: NodePosition,
  size: NodeSize,
  zoom: number,
  viewport: ViewportSize
): ScrollTarget {
  return {
    left: Math.max(0, (rendered.x + size.width / 2) * zoom - viewport.clientWidth / 2),
    top: Math.max(0, (rendered.y + size.height / 2) * zoom - viewport.clientHeight / 2)
  };
}

export function planCanvasWheelZoom(
  oldZoom: number,
  deltaY: number,
  pointer: { x: number; y: number },
  scroll: ScrollTarget
): CanvasWheelZoomPlan | null {
  const delta = deltaY < 0 ? 0.1 : -0.1;
  const zoom = clampValue(Number((oldZoom + delta).toFixed(2)), 0.5, 2.5);
  if (zoom === oldZoom) return null;
  const worldX = (scroll.left + pointer.x) / oldZoom;
  const worldY = (scroll.top + pointer.y) / oldZoom;
  return {
    zoom,
    scroll: {
      left: Math.max(0, worldX * zoom - pointer.x),
      top: Math.max(0, worldY * zoom - pointer.y)
    }
  };
}
