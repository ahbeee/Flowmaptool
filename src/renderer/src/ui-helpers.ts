import type { EdgeLineType, EdgeStyle, FlowEdge, FlowTag, NodeId } from '@shared/graph';
import type { NodeBox } from './routing-geometry';

export const NODE_TEXT_MAX_LEN = 80;

export function boxesOverlap(a: NodeBox, b: NodeBox, gap = 0): boolean {
  return !(
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  );
}

export function clampNodeLabel(label: string, maxLength = NODE_TEXT_MAX_LEN): string {
  return label.slice(0, maxLength);
}

export function nextCustomTagId(tags: FlowTag[]): string {
  let index = tags.length + 1;
  const ids = new Set(tags.map(tag => tag.id));
  while (ids.has(`tag-custom-${index}`)) index++;
  return `tag-custom-${index}`;
}

export function sameValues<T>(values: T[]): T | '' {
  if (values.length === 0) return '';
  const first = values[0];
  return values.every(value => value === first) ? first : '';
}

export function hasMixedValues<T>(values: T[]): boolean {
  return values.length > 1 && values.some(value => value !== values[0]);
}

export function effectiveEdgeStyle(edge: FlowEdge, defaultStyle: EdgeStyle): Required<EdgeStyle> {
  return {
    width: edge.style?.width || defaultStyle.width || 2,
    lineType: edge.style?.lineType || defaultStyle.lineType || 'solid',
    color: edge.style?.color || defaultStyle.color || '#64748b'
  };
}

export function getSelectedStyleEdges(
  edges: FlowEdge[],
  selectedEdgeId: string,
  selectedNodeIds: NodeId[]
): FlowEdge[] {
  if (selectedEdgeId) return edges.filter(edge => edge.id === selectedEdgeId);
  if (selectedNodeIds.length === 0) return [];
  const selected = new Set(selectedNodeIds);
  return edges.filter(edge => selected.has(edge.from) || selected.has(edge.to));
}

export function edgeStrokeDasharray(lineType: EdgeLineType, width: number): string | undefined {
  if (lineType === 'dashed') return `${width * 4} ${width * 3}`;
  if (lineType === 'dotted') return `1 ${width * 3}`;
  return undefined;
}
