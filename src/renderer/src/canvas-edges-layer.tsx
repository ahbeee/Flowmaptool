import React from 'react';
import type { EdgeId, EdgeStyle, FlowEdge } from '@shared/graph';
import type { LayoutDirection, NodeSize, NodeSizeMap } from '@shared/layout';
import type { ConnectDragState } from './connect-dragging';
import { edgeMidpoint, edgePath, routeControlPoint, routeFromBend } from './edge-path';
import type { LayoutPoint } from './edge-routing';
import type { EdgeBendMap, EdgeRoute, EdgeRouteMap } from './persistence';
import type { Point } from './routing-geometry';
import { edgeStrokeDasharray, effectiveEdgeStyle } from './ui-helpers';

type EdgeBendDragState = { edgeId: EdgeId; pointIndex: number };
type EdgeRouteControlSelection = { edgeId: EdgeId; pointIndex: number };

type RenderedEdgeState = {
  fromSize: NodeSize;
  toSize: NodeSize;
  endpoints: { from: Point; to: Point };
  lane: number;
  forceBend: boolean;
};

type CanvasEdgesLayerProps = {
  width: number;
  height: number;
  edges: FlowEdge[];
  defaultEdgeStyle: EdgeStyle;
  renderedPositionMap: Map<string, LayoutPoint>;
  nodeSizeMap: NodeSizeMap;
  defaultNodeSize: NodeSize;
  layoutDirection: LayoutDirection;
  layoutEdgeIds: Set<EdgeId>;
  edgeRoutes: EdgeRouteMap;
  edgeBends: EdgeBendMap;
  autoEdgeRouteMap: Map<EdgeId, EdgeRoute>;
  edgeLaneMap: Map<EdgeId, number>;
  edgeForceBendMap: Map<EdgeId, boolean>;
  selectedEdgeId: EdgeId;
  selectedRouteControl: EdgeRouteControlSelection | null;
  edgeBendDrag: EdgeBendDragState | null;
  connectDrag: ConnectDragState | null;
  getRenderedEdgeEndpoints: (
    edge: FlowEdge,
    fromPos: LayoutPoint,
    toPos: LayoutPoint,
    fromSize: NodeSize,
    toSize: NodeSize
  ) => { from: Point; to: Point };
  onCanvasPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
  onStartEdgeSegmentDrag: (event: React.PointerEvent<SVGPathElement>) => void;
  onSelectEdge: (event: React.MouseEvent<SVGPathElement>, edge: FlowEdge) => void;
  onStartEdgeBendDrag: (event: React.PointerEvent<SVGCircleElement>, edgeId: EdgeId, pointIndex: number) => void;
};

export function CanvasEdgesLayer({
  width,
  height,
  edges,
  defaultEdgeStyle,
  renderedPositionMap,
  nodeSizeMap,
  defaultNodeSize,
  layoutDirection,
  layoutEdgeIds,
  edgeRoutes,
  edgeBends,
  autoEdgeRouteMap,
  edgeLaneMap,
  edgeForceBendMap,
  selectedEdgeId,
  selectedRouteControl,
  edgeBendDrag,
  connectDrag,
  getRenderedEdgeEndpoints,
  onCanvasPointerDown,
  onStartEdgeSegmentDrag,
  onSelectEdge,
  onStartEdgeBendDrag
}: CanvasEdgesLayerProps) {
  const getRenderedEdgeState = (edge: FlowEdge): RenderedEdgeState | null => {
    const fromPos = renderedPositionMap.get(edge.from);
    const toPos = renderedPositionMap.get(edge.to);
    if (!fromPos || !toPos) return null;
    const fromSize = nodeSizeMap[edge.from] || defaultNodeSize;
    const toSize = nodeSizeMap[edge.to] || defaultNodeSize;
    return {
      fromSize,
      toSize,
      endpoints: getRenderedEdgeEndpoints(edge, fromPos, toPos, fromSize, toSize),
      lane: edgeLaneMap.get(edge.id) || 0,
      forceBend: edgeForceBendMap.get(edge.id) || false
    };
  };

  const getRoute = (edge: FlowEdge, state: RenderedEdgeState, fallbackToMidpoint = false) => {
    return (
      edgeRoutes[edge.id] ||
      routeFromBend(edgeBends[edge.id]) ||
      getAutomaticManualRoute(edge, state) ||
      (fallbackToMidpoint ? routeFromBend(edgeMidpoint(state.endpoints.from, state.endpoints.to)) : undefined)
    );
  };

  const getAutomaticManualRoute = (edge: FlowEdge, state: RenderedEdgeState) => {
    if (layoutEdgeIds.has(edge.id) || isForwardAlignedEdge(state.endpoints.from, state.endpoints.to, layoutDirection)) {
      return undefined;
    }
    return autoEdgeRouteMap.get(edge.id);
  };

  return (
    <svg className="edge-layer" aria-label="edge-layer" style={{ width, height }} onPointerDown={onCanvasPointerDown}>
      {edges.map(edge => {
        const state = getRenderedEdgeState(edge);
        if (!state) return null;
        const selected = edge.id === selectedEdgeId;
        const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
        const edgeStyle = effectiveEdgeStyle(edge, defaultEdgeStyle);
        const strokeDasharray = edgeStrokeDasharray(edgeStyle.lineType, edgeStyle.width);
        return (
          <path
            key={edge.id}
            data-testid={`edge-path-${edge.id}`}
            data-edge-id={edge.id}
            d={edgePath(
              state.endpoints.from,
              state.endpoints.to,
              state.lane,
              layoutDirection,
              state.fromSize,
              state.toSize,
              state.forceBend,
              route
            )}
            className={selected ? 'edge-path edge-path-selected' : 'edge-path'}
            style={{
              stroke: edgeStyle.color,
              strokeWidth: selected ? edgeStyle.width + 1 : edgeStyle.width,
              strokeDasharray
            }}
            onPointerDown={onStartEdgeSegmentDrag}
            onClick={event => onSelectEdge(event, edge)}
          />
        );
      })}
      {connectDrag ? (
        <path
          className="edge-path edge-path-preview"
          d={`M ${connectDrag.start.x} ${connectDrag.start.y} Q ${(connectDrag.start.x + connectDrag.current.x) / 2} ${(connectDrag.start.y + connectDrag.current.y) / 2} ${connectDrag.current.x} ${connectDrag.current.y}`}
        />
      ) : null}
      {edgeBendDrag
        ? edges.map(edge => {
            if (edge.id !== edgeBendDrag.edgeId) return null;
            const state = getRenderedEdgeState(edge);
            if (!state) return null;
            const route = edgeRoutes[edge.id] || routeFromBend(edgeBends[edge.id]) || autoEdgeRouteMap.get(edge.id);
            return (
              <path
                key={`route-preview-${edge.id}`}
                data-testid="edge-route-drag-preview"
                className="edge-route-drag-preview"
                d={edgePath(
                  state.endpoints.from,
                  state.endpoints.to,
                  state.lane,
                  layoutDirection,
                  state.fromSize,
                  state.toSize,
                  state.forceBend,
                  route
                )}
              />
            );
          })
        : null}
      {!edgeBendDrag && selectedEdgeId
        ? edges.map(edge => {
            if (edge.id !== selectedEdgeId) return null;
            const state = getRenderedEdgeState(edge);
            if (!state) return null;
            const route = getRoute(edge, state);
            if (!route || route.points.length === 0) return null;
            return (
              <path
                key={`route-guide-${edge.id}`}
                data-testid="edge-route-guide"
                className="edge-route-guide"
                d={edgePath(
                  state.endpoints.from,
                  state.endpoints.to,
                  state.lane,
                  layoutDirection,
                  state.fromSize,
                  state.toSize,
                  state.forceBend,
                  route
                )}
              />
            );
          })
        : null}
      {edges.map(edge => {
        if (edge.id !== selectedEdgeId) return null;
        const state = getRenderedEdgeState(edge);
        if (!state) return null;
        const route = getRoute(edge, state, true);
        if (!route) return null;
        const point =
          route.points.length === 1
            ? route.points[0]
            : routeControlPoint(state.endpoints.from, state.endpoints.to, route);
        const pointIndex = 0;
        return (
          <g key={`bend-${edge.id}`}>
            <circle
              className="edge-bend-hit-area"
              cx={point.x}
              cy={point.y}
              r={9}
              onPointerDown={event => onStartEdgeBendDrag(event, edge.id, pointIndex)}
              onContextMenu={stopSvgContextMenu}
            />
            <circle
              data-testid={`edge-route-point-${pointIndex}`}
              className={
                selectedRouteControl?.edgeId === edge.id && selectedRouteControl.pointIndex === pointIndex
                  ? 'edge-bend-handle edge-bend-handle-selected'
                  : 'edge-bend-handle'
              }
              cx={point.x}
              cy={point.y}
              r={7}
              onPointerDown={event => onStartEdgeBendDrag(event, edge.id, pointIndex)}
              onContextMenu={stopSvgContextMenu}
            />
          </g>
        );
      })}
    </svg>
  );
}

function isForwardAlignedEdge(from: Point, to: Point, layoutDirection: LayoutDirection) {
  return layoutDirection === 'horizontal'
    ? to.x >= from.x && Math.abs(to.y - from.y) <= 2
    : to.y >= from.y && Math.abs(to.x - from.x) <= 2;
}

function stopSvgContextMenu(event: React.MouseEvent<SVGCircleElement>) {
  event.preventDefault();
  event.stopPropagation();
}
