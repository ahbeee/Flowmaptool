import type { EdgeStyle, FlowDoc, FlowEdge, NodeId, NodeShape, NodeStyle } from '../../shared/graph';
import type { LayoutDirection, NodePosition, NodeSize, NodeSizeMap } from '../../shared/layout';
import type { CanvasSize } from './canvas-geometry';
import { edgePath, routeFromBend } from './edge-path';
import { escapeXml } from './export-utils';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_NODE_SIZE,
  NODE_PADDING_X
} from './node-style';
import type { EdgeBendMap, EdgeRoute, EdgeRouteMap } from './persistence';
import type { Point } from './routing-geometry';
import { clampNodeLabel, edgeStrokeDasharray, effectiveEdgeStyle } from './ui-helpers';

export type SvgEdgeSnapshot = {
  id: string;
  from: Point;
  to: Point;
  lane: number;
  fromSize: NodeSize;
  toSize: NodeSize;
  forceBend: boolean;
  style: Required<EdgeStyle>;
  route?: EdgeRoute;
};

export type SvgNodeSnapshot = {
  id: NodeId;
  label: string;
  style: NodeStyle | undefined;
  isRoot: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SvgSnapshot = {
  nodes: SvgNodeSnapshot[];
  edges: SvgEdgeSnapshot[];
};

export type SvgTheme = {
  canvas: string;
  edge: string;
  nodeBg: string;
  nodeText: string;
  rootBg: string;
  rootText: string;
};

export type EdgeEndpointResolver = (
  edge: FlowEdge,
  fromPos: NodePosition,
  toPos: NodePosition,
  fromSize: NodeSize,
  toSize: NodeSize
) => { from: Point; to: Point };

export type BuildSvgSnapshotOptions = {
  doc: FlowDoc;
  renderedPositionMap: Map<NodeId, NodePosition>;
  nodeSizeMap: NodeSizeMap;
  rootNodeIds: Set<NodeId>;
  edgeRoutes: EdgeRouteMap;
  edgeBends: EdgeBendMap;
  autoEdgeRouteMap: Map<string, EdgeRoute>;
  edgeLaneMap: Map<string, number>;
  edgeForceBendMap: Map<string, boolean>;
  getRenderedEdgeEndpoints: EdgeEndpointResolver;
  defaultNodeSize?: NodeSize;
};

export type BuildCanvasSvgOptions = {
  canvasSize: CanvasSize;
  theme: SvgTheme;
  defaultShape: NodeShape;
  layoutDirection: LayoutDirection;
  fitToContent?: boolean;
};

export function buildSvgSnapshot({
  doc,
  renderedPositionMap,
  nodeSizeMap,
  rootNodeIds,
  edgeRoutes,
  edgeBends,
  autoEdgeRouteMap,
  edgeLaneMap,
  edgeForceBendMap,
  getRenderedEdgeEndpoints,
  defaultNodeSize = DEFAULT_NODE_SIZE
}: BuildSvgSnapshotOptions): SvgSnapshot {
  const nodes: SvgNodeSnapshot[] = doc.nodes
    .map(node => {
      const pos = renderedPositionMap.get(node.id);
      if (!pos) return null;
      const size = nodeSizeMap[node.id] || defaultNodeSize;
      return {
        id: node.id,
        label: node.label,
        style: node.style,
        isRoot: rootNodeIds.has(node.id),
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height
      };
    })
    .filter((item): item is SvgNodeSnapshot => item !== null);

  const edges: SvgEdgeSnapshot[] = [];
  for (const edge of doc.edges) {
    const fromPos = renderedPositionMap.get(edge.from);
    const toPos = renderedPositionMap.get(edge.to);
    if (!fromPos || !toPos) continue;
    const fromSize = nodeSizeMap[edge.from] || defaultNodeSize;
    const toSize = nodeSizeMap[edge.to] || defaultNodeSize;
    const endpoints = getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize);
    const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
    edges.push({
      id: edge.id,
      from: endpoints.from,
      to: endpoints.to,
      lane: edgeLaneMap.get(edge.id) || 0,
      fromSize,
      toSize,
      forceBend: edgeForceBendMap.get(edge.id) || false,
      style: effectiveEdgeStyle(edge, doc.settings.defaultEdgeStyle),
      ...(route ? { route } : {})
    });
  }

  return { nodes, edges };
}

export function buildCanvasSvg(
  snapshot: SvgSnapshot,
  { canvasSize, theme, defaultShape, layoutDirection, fitToContent = false }: BuildCanvasSvgOptions
): string {
  let offsetX = 0;
  let offsetY = 0;
  let svgWidth = canvasSize.width;
  let svgHeight = canvasSize.height;

  if (fitToContent && (snapshot.nodes.length > 0 || snapshot.edges.length > 0)) {
    const padding = 48;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const node of snapshot.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    for (const edge of snapshot.edges) {
      const routePoints = edge.route?.points || [];
      minX = Math.min(minX, edge.from.x, edge.to.x, ...routePoints.map(point => point.x));
      minY = Math.min(minY, edge.from.y, edge.to.y, ...routePoints.map(point => point.y));
      maxX = Math.max(maxX, edge.from.x, edge.to.x, ...routePoints.map(point => point.x));
      maxY = Math.max(maxY, edge.from.y, edge.to.y, ...routePoints.map(point => point.y));
    }

    if (Number.isFinite(minX) && Number.isFinite(minY)) {
      offsetX = padding - minX;
      offsetY = padding - minY;
      svgWidth = Math.ceil(maxX - minX + padding * 2);
      svgHeight = Math.ceil(maxY - minY + padding * 2);
    }
  }

  const shiftPoint = (point: Point): Point => ({ x: point.x + offsetX, y: point.y + offsetY });
  const edgeMarkup = snapshot.edges
    .map(edge => {
      const from = shiftPoint(edge.from);
      const to = shiftPoint(edge.to);
      const route = edge.route ? { points: edge.route.points.map(point => shiftPoint(point)) } : undefined;
      const dash = edgeStrokeDasharray(edge.style.lineType, edge.style.width);
      const dashMarkup = dash ? ` stroke-dasharray="${dash}"` : '';
      return `<path d="${edgePath(from, to, edge.lane, layoutDirection, edge.fromSize, edge.toSize, edge.forceBend, route)}" stroke="${edge.style.color}" stroke-width="${edge.style.width}"${dashMarkup} fill="none" stroke-linecap="round" />`;
    })
    .join('');
  const nodeMarkup = snapshot.nodes
    .map(node => {
      const text = clampNodeLabel(node.label).replace(/\r?\n/g, ' ') || ' ';
      const style = node.style || {};
      const shape = style.shape || (node.isRoot ? 'rounded' : defaultShape);
      const fill = style.backgroundColor || (node.isRoot ? theme.rootBg : theme.nodeBg);
      const textColor = style.textColor || (node.isRoot ? theme.rootText : theme.nodeText);
      const fontSize = style.fontSize || DEFAULT_FONT_SIZE;
      const fontWeight = style.bold ? 700 : 400;
      const fontStyle = style.italic ? 'italic' : 'normal';
      const textDecoration = style.underline ? 'underline' : 'none';
      const radius =
        shape === 'pill' ? node.height / 2 : shape === 'square' || shape === 'underline' || shape === 'plain' ? 0 : 8;
      const textAnchor = style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start';
      const textX =
        style.textAlign === 'center'
          ? node.width / 2
          : style.textAlign === 'right'
            ? node.width - NODE_PADDING_X
            : NODE_PADDING_X;
      const textY = Math.round(node.height / 2 + fontSize * 0.35);
      const textMarkup = `<text x="${textX}" y="${textY}" text-anchor="${textAnchor}" font-family="${escapeXml(style.fontFamily || DEFAULT_FONT_FAMILY)}, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" text-decoration="${textDecoration}" fill="${textColor}">${escapeXml(text)}</text>`;
      const x = node.x + offsetX;
      const y = node.y + offsetY;
      if (shape === 'underline') {
        return `<g transform="translate(${x},${y})"><line x1="0" y1="${node.height - 1}" x2="${node.width}" y2="${node.height - 1}" stroke="${theme.edge}" stroke-width="2" />${textMarkup}</g>`;
      }
      if (shape === 'plain') {
        return `<g transform="translate(${x},${y})">${textMarkup}</g>`;
      }
      return `<g transform="translate(${x},${y})"><rect rx="${radius}" ry="${radius}" width="${node.width}" height="${node.height}" fill="${fill}" stroke="${theme.edge}" />${textMarkup}</g>`;
    })
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
    `<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="${theme.canvas}" />`,
    edgeMarkup,
    nodeMarkup,
    '</svg>'
  ].join('');
}
