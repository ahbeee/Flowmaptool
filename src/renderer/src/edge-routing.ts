import type { EdgeAnchor, EdgeAnchors, EdgeId, FlowEdge, NodeId } from '@shared/graph';
import type { LayoutDirection, NodeSize } from '@shared/layout';
import { compactRoutePoints, edgeMidpoint, routeFromBend } from './edge-path';
import type { EdgeBend, EdgeRoute } from './persistence';
import {
  routeClearancePenalty,
  routeLength,
  routeObstacleCount,
  routeTurnCount,
  type NodeBox,
  type Point
} from './routing-geometry';

export type LayoutPoint = { x: number; y: number };
export type RouteSpacing = { primary: number; secondary: number };
export type DraggedRouteEndpointOffsets = {
  source?: number;
  target?: number;
};

export function getNodeCenter(x: number, y: number, size: NodeSize): Point {
  return { x: x + size.width / 2, y: y + size.height / 2 };
}

export function getEdgeEndpoints(
  from: LayoutPoint,
  to: LayoutPoint,
  direction: LayoutDirection,
  fromSize: NodeSize,
  toSize: NodeSize
): { from: Point; to: Point } {
  const fromCenter = getNodeCenter(from.x, from.y, fromSize);
  const toCenter = getNodeCenter(to.x, to.y, toSize);
  if (direction === 'vertical') {
    return {
      from: { x: fromCenter.x, y: from.y + fromSize.height },
      to: { x: toCenter.x, y: to.y }
    };
  }
  return {
    from: { x: from.x + fromSize.width, y: fromCenter.y },
    to: { x: to.x, y: toCenter.y }
  };
}

export function getDirectionalAnchorPoint(
  pos: LayoutPoint,
  size: NodeSize,
  direction: LayoutDirection,
  anchor: 'front' | 'back'
): Point {
  const center = getNodeCenter(pos.x, pos.y, size);
  if (direction === 'vertical') {
    return anchor === 'front' ? { x: center.x, y: pos.y } : { x: center.x, y: pos.y + size.height };
  }
  return anchor === 'front' ? { x: pos.x, y: center.y } : { x: pos.x + size.width, y: center.y };
}

function getBodyAnchorPoint(pos: LayoutPoint, size: NodeSize, other: Point): Point {
  const center = getNodeCenter(pos.x, pos.y, size);
  const dx = other.x - center.x;
  const dy = other.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? { x: pos.x, y: center.y } : { x: pos.x + size.width, y: center.y };
  }
  return dy < 0 ? { x: center.x, y: pos.y } : { x: center.x, y: pos.y + size.height };
}

function getAnchoredPoint(
  pos: LayoutPoint,
  size: NodeSize,
  direction: LayoutDirection,
  anchor: EdgeAnchors['from'],
  autoPoint: Point,
  otherPoint: Point,
  isTarget = false
): Point {
  if (anchor === 'front' || anchor === 'back') return getDirectionalAnchorPoint(pos, size, direction, anchor);
  if (anchor === 'body' && isTarget) return getDirectionalAnchorPoint(pos, size, direction, 'front');
  if (anchor === 'body') return getBodyAnchorPoint(pos, size, otherPoint);
  return autoPoint;
}

export function getEdgeRenderEndpoints(
  edge: FlowEdge,
  from: LayoutPoint,
  to: LayoutPoint,
  direction: LayoutDirection,
  fromSize: NodeSize,
  toSize: NodeSize,
  isLayoutEdge: boolean,
  targetIsRoot: boolean
): { from: Point; to: Point } {
  const endpoints = getEdgeEndpoints(from, to, direction, fromSize, toSize);
  if (edge.anchors) {
    const fromPoint = getAnchoredPoint(from, fromSize, direction, edge.anchors.from, endpoints.from, endpoints.to);
    const toPoint = getAnchoredPoint(to, toSize, direction, edge.anchors.to, endpoints.to, fromPoint, true);
    return { from: fromPoint, to: toPoint };
  }
  if (isLayoutEdge || targetIsRoot) return endpoints;

  const fromCenter = getNodeCenter(from.x, from.y, fromSize);
  const toCenter = getNodeCenter(to.x, to.y, toSize);
  if (direction === 'vertical') {
    const targetIsAboveSource = to.y + toSize.height <= from.y;
    if (!targetIsAboveSource) return endpoints;
    return {
      from: endpoints.from,
      to: { x: toCenter.x, y: to.y + toSize.height }
    };
  }

  const targetIsBehindSource = to.x + toSize.width <= from.x;
  if (!targetIsBehindSource) return endpoints;
  return {
    from: endpoints.from,
    to: { x: to.x + toSize.width, y: toCenter.y }
  };
}

export function edgeIntersectsNodeCorridor(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>
) {
  return edgeCorridorObstacleBoxes(from, to, direction, fromId, toId, nodeBoxes).length > 0;
}

function edgeCorridorObstacleBoxes(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>
): NodeBox[] {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const obstacles: NodeBox[] = [];

  for (const [nodeId, box] of nodeBoxes.entries()) {
    if (nodeId === fromId || nodeId === toId) continue;

    if (direction === 'horizontal') {
      const xInset = Math.min(56, dx * 0.3);
      const corridorLeft = minX + xInset;
      const corridorRight = maxX - xInset;
      if (corridorRight <= corridorLeft) continue;
      const corridorTop = minY - 14;
      const corridorBottom = maxY + 14;
      const intersectsX = box.left < corridorRight && box.right > corridorLeft;
      const intersectsY = box.top < corridorBottom && box.bottom > corridorTop;
      if (intersectsX && intersectsY) obstacles.push(box);
      continue;
    }

    const yInset = Math.min(56, dy * 0.3);
    const corridorTop = minY + yInset;
    const corridorBottom = maxY - yInset;
    if (corridorBottom <= corridorTop) continue;
    const corridorLeft = minX - 14;
    const corridorRight = maxX + 14;
    const intersectsX = box.left < corridorRight && box.right > corridorLeft;
    const intersectsY = box.top < corridorBottom && box.bottom > corridorTop;
    if (intersectsX && intersectsY) obstacles.push(box);
  }

  return obstacles;
}

function computeAutoEdgeBend(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>
): EdgeBend | undefined {
  const obstacles = edgeCorridorObstacleBoxes(from, to, direction, fromId, toId, nodeBoxes);
  const isBackEdge = direction === 'horizontal' ? to.x < from.x : to.y < from.y;
  if (!isBackEdge && obstacles.length === 0) return undefined;

  const midpoint = edgeMidpoint(from, to);
  const clearance = 48;

  if (direction === 'horizontal') {
    const top =
      obstacles.length > 0 ? Math.min(...obstacles.map(box => box.top), from.y, to.y) : Math.min(from.y, to.y);
    const bottom =
      obstacles.length > 0 ? Math.max(...obstacles.map(box => box.bottom), from.y, to.y) : Math.max(from.y, to.y);
    const upperY = top - clearance;
    const lowerY = bottom + clearance;
    const y =
      isBackEdge && obstacles.length === 0
        ? upperY
        : Math.abs(midpoint.y - upperY) <= Math.abs(midpoint.y - lowerY)
          ? upperY
          : lowerY;
    return { x: midpoint.x, y };
  }

  const left =
    obstacles.length > 0 ? Math.min(...obstacles.map(box => box.left), from.x, to.x) : Math.min(from.x, to.x);
  const right =
    obstacles.length > 0 ? Math.max(...obstacles.map(box => box.right), from.x, to.x) : Math.max(from.x, to.x);
  const leftX = left - clearance;
  const rightX = right + clearance;
  const x =
    isBackEdge && obstacles.length === 0
      ? leftX
      : Math.abs(midpoint.x - leftX) <= Math.abs(midpoint.x - rightX)
        ? leftX
        : rightX;
  return { x, y: midpoint.y };
}

function getNodeBoxesBounds(boxes: NodeBox[]): NodeBox | undefined {
  if (boxes.length === 0) return undefined;
  return {
    left: Math.min(...boxes.map(box => box.left)),
    right: Math.max(...boxes.map(box => box.right)),
    top: Math.min(...boxes.map(box => box.top)),
    bottom: Math.max(...boxes.map(box => box.bottom))
  };
}

function getAdjacentGapLanes(box: NodeBox, boxes: NodeBox[], direction: LayoutDirection, minimumGap: number): number[] {
  if (direction === 'horizontal') {
    const overlapsPrimaryAxis = (candidate: NodeBox) => candidate.right >= box.left && candidate.left <= box.right;
    const above = boxes
      .filter(
        candidate =>
          overlapsPrimaryAxis(candidate) && candidate.bottom <= box.top && box.top - candidate.bottom >= minimumGap
      )
      .sort((left, right) => right.bottom - left.bottom)[0];
    const below = boxes
      .filter(
        candidate =>
          overlapsPrimaryAxis(candidate) && candidate.top >= box.bottom && candidate.top - box.bottom >= minimumGap
      )
      .sort((left, right) => left.top - right.top)[0];
    return [
      above ? above.bottom + (box.top - above.bottom) / 2 : undefined,
      below ? box.bottom + (below.top - box.bottom) / 2 : undefined
    ].filter((lane): lane is number => typeof lane === 'number');
  }

  const overlapsPrimaryAxis = (candidate: NodeBox) => candidate.bottom >= box.top && candidate.top <= box.bottom;
  const left = boxes
    .filter(
      candidate =>
        overlapsPrimaryAxis(candidate) && candidate.right <= box.left && box.left - candidate.right >= minimumGap
    )
    .sort((a, b) => b.right - a.right)[0];
  const right = boxes
    .filter(
      candidate =>
        overlapsPrimaryAxis(candidate) && candidate.left >= box.right && candidate.left - box.right >= minimumGap
    )
    .sort((a, b) => a.left - b.left)[0];
  return [
    left ? left.right + (box.left - left.right) / 2 : undefined,
    right ? box.right + (right.left - box.right) / 2 : undefined
  ].filter((lane): lane is number => typeof lane === 'number');
}

function getPreferredBackEdgeLanes(
  box: NodeBox | undefined,
  boxes: NodeBox[],
  direction: LayoutDirection,
  secondaryClearance: number,
  lanePadding: number,
  fallbackLane: number,
  referenceLane: number = fallbackLane
): number[] {
  if (!box) return [fallbackLane];
  const secondaryDelta = Math.abs(referenceLane - fallbackLane);
  if (secondaryDelta <= secondaryClearance) {
    return direction === 'horizontal'
      ? [box.top - secondaryClearance - lanePadding]
      : [box.left - secondaryClearance - lanePadding];
  }
  const adjacentGapLanes = getAdjacentGapLanes(box, boxes, direction, 8);
  if (adjacentGapLanes.length > 0) {
    return adjacentGapLanes.sort((left, right) => Math.abs(left - referenceLane) - Math.abs(right - referenceLane));
  }
  if (direction === 'horizontal') {
    return [box.top - secondaryClearance - lanePadding, box.bottom + secondaryClearance + lanePadding];
  }
  return [box.left - secondaryClearance - lanePadding, box.right + secondaryClearance + lanePadding];
}

export function filterNodeBoxesByIds(nodeBoxes: Map<NodeId, NodeBox>, nodeIds: Iterable<NodeId>): Map<NodeId, NodeBox> {
  const filtered = new Map<NodeId, NodeBox>();
  for (const nodeId of nodeIds) {
    const box = nodeBoxes.get(nodeId);
    if (box) filtered.set(nodeId, box);
  }
  return filtered;
}

function routeFromPoints(points: Point[]): EdgeRoute | undefined {
  return points.length > 0 ? { points } : undefined;
}

function dedupeRouteCandidates(candidates: Point[][]): Point[][] {
  const seen = new Set<string>();
  const unique: Point[][] = [];
  for (const candidate of candidates) {
    const key = candidate.map(point => `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function chooseBestRoute(
  candidates: Point[][],
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>
): EdgeRoute | undefined {
  const [best] = dedupeRouteCandidates(candidates)
    .map(points => ({
      points,
      obstacleCount: routeObstacleCount(points, fromId, toId, nodeBoxes),
      clearancePenalty: routeClearancePenalty(points, fromId, toId, nodeBoxes),
      length: routeLength(points),
      turns: routeTurnCount(points)
    }))
    .sort(
      (left, right) =>
        left.obstacleCount - right.obstacleCount ||
        left.clearancePenalty - right.clearancePenalty ||
        left.turns - right.turns ||
        left.length - right.length
    );
  return best ? routeFromPoints(best.points.slice(1, -1)) : undefined;
}

function chooseBestSnappedRoute(
  candidates: Array<{ points: Point[]; laneDistance: number; pointerDistance?: number }>,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>,
  preferClearance = false
): EdgeRoute | undefined {
  const [best] = candidates
    .map(candidate => ({
      ...candidate,
      obstacleCount: routeObstacleCount(candidate.points, fromId, toId, nodeBoxes),
      clearancePenalty: Math.min(50000, routeClearancePenalty(candidate.points, fromId, toId, nodeBoxes)),
      length: routeLength(candidate.points),
      turns: routeTurnCount(candidate.points)
    }))
    .sort((left, right) => {
      const common = left.obstacleCount - right.obstacleCount;
      if (common !== 0) return common;
      if (preferClearance) {
        return (
          left.clearancePenalty - right.clearancePenalty ||
          left.laneDistance - right.laneDistance ||
          (left.pointerDistance || 0) - (right.pointerDistance || 0) ||
          left.turns - right.turns ||
          left.length - right.length
        );
      }
      return (
        left.laneDistance - right.laneDistance ||
        (left.pointerDistance || 0) - (right.pointerDistance || 0) ||
        left.clearancePenalty - right.clearancePenalty ||
        left.turns - right.turns ||
        left.length - right.length
      );
    });
  return best ? routeFromPoints(best.points.slice(1, -1)) : undefined;
}

export function computeAutoEdgeRoute(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>,
  routeLane = 0,
  spacing: RouteSpacing = { primary: 48, secondary: 48 },
  anchors?: EdgeAnchors
): EdgeRoute | undefined {
  const obstacles = edgeCorridorObstacleBoxes(from, to, direction, fromId, toId, nodeBoxes);
  const isBackEdge = direction === 'horizontal' ? to.x < from.x : to.y < from.y;
  if (!isBackEdge && obstacles.length === 0) return undefined;

  const primaryClearance = getEndpointSpacingOffset(spacing.primary) || 24;
  const secondaryClearance = getEndpointSpacingOffset(spacing.secondary) || 24;
  const lanePadding = Math.min(72, Math.max(0, routeLane) * 14);
  const graphBounds = getNodeBoxesBounds([...nodeBoxes.values()]);
  const allBoxes = [...nodeBoxes.values()];

  if (direction === 'horizontal') {
    const sourceSign = getRouteTangentSign(anchors?.from, 'source', direction, from, to);
    const targetSign = getRouteTangentSign(anchors?.to, 'target', direction, from, to);
    if (isBackEdge && graphBounds) {
      const sourceExitX = from.x + sourceSign * primaryClearance;
      const targetEntryX = to.x + targetSign * primaryClearance;
      const sourceBox = nodeBoxes.get(fromId);
      const targetBox = nodeBoxes.get(toId);
      const sourcePreferredLanes = getPreferredBackEdgeLanes(
        sourceBox,
        allBoxes,
        direction,
        secondaryClearance,
        lanePadding,
        from.y,
        to.y
      );
      const targetPreferredLanes = getPreferredBackEdgeLanes(
        targetBox,
        allBoxes,
        direction,
        secondaryClearance,
        lanePadding,
        to.y,
        from.y
      );
      const laneCandidates = uniqueSortedNumbers([
        ...getDraggedRouteLaneCandidates(from, to, direction, from, nodeBoxes, spacing, false),
        ...sourcePreferredLanes,
        ...targetPreferredLanes
      ]);
      const routes = laneCandidates.map(lane => ({
        laneDistance:
          Math.min(...sourcePreferredLanes.map(preferred => Math.abs(lane - preferred))) * 2 +
          Math.min(...targetPreferredLanes.map(preferred => Math.abs(lane - preferred))),
        points: [
          from,
          { x: sourceExitX, y: from.y },
          { x: sourceExitX, y: lane },
          { x: targetEntryX, y: lane },
          { x: targetEntryX, y: to.y },
          to
        ]
      }));
      return chooseBestSnappedRoute(routes, fromId, toId, nodeBoxes);
    }

    const bounds = getNodeBoxesBounds(obstacles) || graphBounds;
    if (!bounds) return routeFromBend(computeAutoEdgeBend(from, to, direction, fromId, toId, nodeBoxes));
    const topLane = bounds.top - secondaryClearance - lanePadding;
    const bottomLane = bounds.bottom + secondaryClearance + lanePadding;
    const dx = Math.max(80, Math.abs(to.x - from.x));
    const entryX = from.x + Math.min(primaryClearance, dx / 3);
    const exitX = to.x - Math.min(primaryClearance, dx / 3);
    return chooseBestRoute(
      [
        [
          from,
          { x: entryX, y: from.y },
          { x: entryX, y: topLane },
          { x: exitX, y: topLane },
          { x: exitX, y: to.y },
          to
        ],
        [
          from,
          { x: entryX, y: from.y },
          { x: entryX, y: bottomLane },
          { x: exitX, y: bottomLane },
          { x: exitX, y: to.y },
          to
        ]
      ],
      fromId,
      toId,
      nodeBoxes
    );
  }

  const sourceSign = getRouteTangentSign(anchors?.from, 'source', direction, from, to);
  const targetSign = getRouteTangentSign(anchors?.to, 'target', direction, from, to);
  if (isBackEdge && graphBounds) {
    const sourceExitY = from.y + sourceSign * primaryClearance;
    const targetEntryY = to.y + targetSign * primaryClearance;
    const sourceBox = nodeBoxes.get(fromId);
    const targetBox = nodeBoxes.get(toId);
    const sourcePreferredLanes = getPreferredBackEdgeLanes(
      sourceBox,
      allBoxes,
      direction,
      secondaryClearance,
      lanePadding,
      from.x,
      to.x
    );
    const targetPreferredLanes = getPreferredBackEdgeLanes(
      targetBox,
      allBoxes,
      direction,
      secondaryClearance,
      lanePadding,
      to.x,
      from.x
    );
    const laneCandidates = uniqueSortedNumbers([
      ...getDraggedRouteLaneCandidates(from, to, direction, from, nodeBoxes, spacing, false),
      ...sourcePreferredLanes,
      ...targetPreferredLanes
    ]);
    const routes = laneCandidates.map(lane => ({
      laneDistance:
        Math.min(...sourcePreferredLanes.map(preferred => Math.abs(lane - preferred))) * 2 +
        Math.min(...targetPreferredLanes.map(preferred => Math.abs(lane - preferred))),
      points: [
        from,
        { x: from.x, y: sourceExitY },
        { x: lane, y: sourceExitY },
        { x: lane, y: targetEntryY },
        { x: to.x, y: targetEntryY },
        to
      ]
    }));
    return chooseBestSnappedRoute(routes, fromId, toId, nodeBoxes);
  }

  const bounds = getNodeBoxesBounds(obstacles) || graphBounds;
  if (!bounds) return routeFromBend(computeAutoEdgeBend(from, to, direction, fromId, toId, nodeBoxes));
  const leftLane = bounds.left - secondaryClearance - lanePadding;
  const rightLane = bounds.right + secondaryClearance + lanePadding;
  const dy = Math.max(80, Math.abs(to.y - from.y));
  const entryY = from.y + Math.min(primaryClearance, dy / 3);
  const exitY = to.y - Math.min(primaryClearance, dy / 3);
  return chooseBestRoute(
    [
      [
        from,
        { x: from.x, y: entryY },
        { x: leftLane, y: entryY },
        { x: leftLane, y: exitY },
        { x: to.x, y: exitY },
        to
      ],
      [
        from,
        { x: from.x, y: entryY },
        { x: rightLane, y: entryY },
        { x: rightLane, y: exitY },
        { x: to.x, y: exitY },
        to
      ]
    ],
    fromId,
    toId,
    nodeBoxes
  );
}

function getRouteTangentSign(
  anchor: EdgeAnchor | undefined,
  role: 'source' | 'target',
  direction: LayoutDirection,
  from: Point,
  to: Point
): number {
  if (anchor === 'front') return -1;
  if (anchor === 'back') return 1;
  if (anchor === 'body' && role === 'target') return -1;
  if (direction === 'horizontal') return to.x >= from.x ? 1 : -1;
  return to.y >= from.y ? 1 : -1;
}

const MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET = 10;

function getDraggedRouteOffset(distance: number, neighborOffset?: number): number {
  const fallback = Math.min(72, distance / 3);
  if (typeof neighborOffset !== 'number' || !Number.isFinite(neighborOffset)) return fallback;
  return Math.min(
    Math.max(MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET, distance - MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET),
    Math.max(MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET, neighborOffset)
  );
}

export function getEndpointSpacingOffset(spacing: number): number | undefined {
  if (!Number.isFinite(spacing)) return undefined;
  const routeGap = Math.max(MIN_DRAGGED_ROUTE_ENDPOINT_OFFSET * 2, spacing);
  return routeGap / 2;
}

export function getRouteSpacingOffsets(spacing: RouteSpacing): { primary: number; secondary: number } {
  return {
    primary: getEndpointSpacingOffset(spacing.primary) || 24,
    secondary: getEndpointSpacingOffset(spacing.secondary) || 24
  };
}

function uniqueSortedNumbers(values: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values.sort((left, right) => left - right)) {
    const rounded = Math.round(value * 10) / 10;
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    result.push(value);
  }
  return result;
}

function getDraggedRouteLaneCandidates(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  pointer: Point,
  nodeBoxes: Map<NodeId, NodeBox>,
  spacing: RouteSpacing,
  includeEndpointLanes = true
): number[] {
  const { secondary } = getRouteSpacingOffsets(spacing);
  const bounds = getNodeBoxesBounds([...nodeBoxes.values()]);
  const candidates: number[] = [];

  if (direction === 'horizontal') {
    if (includeEndpointLanes) candidates.push(from.y, to.y);
    const boxes = [...nodeBoxes.values()].sort((left, right) => left.top - right.top || left.left - right.left);
    for (const box of boxes) {
      candidates.push(box.top - secondary, box.bottom + secondary);
    }
    for (let index = 1; index < boxes.length; index += 1) {
      const previous = boxes[index - 1];
      const current = boxes[index];
      if (current.top >= previous.bottom) {
        candidates.push(previous.bottom + (current.top - previous.bottom) / 2);
      }
    }
    if (bounds) candidates.push(bounds.top - secondary, bounds.bottom + secondary);
    if (candidates.length === 0) candidates.push(pointer.y);
    return uniqueSortedNumbers(candidates);
  }

  if (includeEndpointLanes) candidates.push(from.x, to.x);
  const boxes = [...nodeBoxes.values()].sort((left, right) => left.left - right.left || left.top - right.top);
  for (const box of boxes) {
    candidates.push(box.left - secondary, box.right + secondary);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    const current = boxes[index];
    if (current.left >= previous.right) {
      candidates.push(previous.right + (current.left - previous.right) / 2);
    }
  }
  if (bounds) candidates.push(bounds.left - secondary, bounds.right + secondary);
  if (candidates.length === 0) candidates.push(pointer.x);
  return uniqueSortedNumbers(candidates);
}

function routeFromDraggedControl(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  pointer: Point,
  anchors?: EdgeAnchors,
  endpointOffsets?: DraggedRouteEndpointOffsets
): EdgeRoute {
  if (direction === 'horizontal') {
    const distance = Math.max(48, Math.abs(to.x - from.x));
    const sourceSign = getRouteTangentSign(anchors?.from, 'source', direction, from, to);
    const targetSign = getRouteTangentSign(anchors?.to, 'target', direction, from, to);
    const sourceOffset = getDraggedRouteOffset(distance, endpointOffsets?.source);
    const targetOffset = getDraggedRouteOffset(distance, endpointOffsets?.target);
    const entryX = from.x + sourceSign * sourceOffset;
    const exitX = to.x + targetSign * targetOffset;
    return {
      points: compactRoutePoints([
        { x: entryX, y: from.y },
        { x: entryX, y: pointer.y },
        { x: exitX, y: pointer.y },
        { x: exitX, y: to.y }
      ])
    };
  }

  const distance = Math.max(48, Math.abs(to.y - from.y));
  const sourceSign = getRouteTangentSign(anchors?.from, 'source', direction, from, to);
  const targetSign = getRouteTangentSign(anchors?.to, 'target', direction, from, to);
  const sourceOffset = getDraggedRouteOffset(distance, endpointOffsets?.source);
  const targetOffset = getDraggedRouteOffset(distance, endpointOffsets?.target);
  const entryY = from.y + sourceSign * sourceOffset;
  const exitY = to.y + targetSign * targetOffset;
  return {
    points: compactRoutePoints([
      { x: from.x, y: entryY },
      { x: pointer.x, y: entryY },
      { x: pointer.x, y: exitY },
      { x: to.x, y: exitY }
    ])
  };
}

export function routeFromSnappedDraggedControl(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  pointer: Point,
  fromId: NodeId,
  toId: NodeId,
  nodeBoxes: Map<NodeId, NodeBox>,
  spacing: RouteSpacing,
  anchors?: EdgeAnchors,
  endpointOffsets?: DraggedRouteEndpointOffsets
): EdgeRoute {
  const candidates = getDraggedRouteLaneCandidates(from, to, direction, pointer, nodeBoxes, spacing, false);
  const pointerLane = direction === 'horizontal' ? pointer.y : pointer.x;
  const snappedCandidates = candidates.map(lane => {
    const snappedPointer = direction === 'horizontal' ? { x: pointer.x, y: lane } : { x: lane, y: pointer.y };
    const route = routeFromDraggedControl(from, to, direction, snappedPointer, anchors, endpointOffsets);
    const points = [from, ...route.points, to];
    return {
      route,
      laneDistance: Math.abs(lane - pointerLane),
      obstacleCount: routeObstacleCount(points, fromId, toId, nodeBoxes),
      clearancePenalty: Math.min(50000, routeClearancePenalty(points, fromId, toId, nodeBoxes)),
      turns: routeTurnCount(points),
      length: routeLength(points)
    };
  });
  const scoredRoutes = snappedCandidates.sort(
    (left, right) =>
      left.obstacleCount - right.obstacleCount ||
      left.laneDistance - right.laneDistance ||
      left.clearancePenalty - right.clearancePenalty ||
      left.turns - right.turns ||
      left.length - right.length
  );

  return scoredRoutes[0]?.route || routeFromDraggedControl(from, to, direction, pointer, anchors, endpointOffsets);
}

export function isForwardIncomingManualEdge(
  edge: FlowEdge,
  from: Point,
  to: Point,
  direction: LayoutDirection,
  layoutEdgeIds: Set<EdgeId>
): boolean {
  if (edge.role !== 'manual' || layoutEdgeIds.has(edge.id)) return false;
  if (edge.anchors?.from === 'front' || edge.anchors?.to === 'back') return false;
  return direction === 'horizontal' ? to.x > from.x + 12 : to.y > from.y + 12;
}

export function routeForwardIncomingConverge(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  primaryGap: number
): EdgeRoute | undefined {
  const inset = Math.max(18, Math.min(48, primaryGap * 0.65));
  const minSegment = 10;

  if (direction === 'horizontal') {
    const directDistance = to.x - from.x;
    if (directDistance <= minSegment * 2) return undefined;
    let trunkX = to.x - inset;
    if (trunkX <= from.x + minSegment || trunkX >= to.x - minSegment) {
      trunkX = from.x + directDistance / 2;
    }
    if (trunkX <= from.x + minSegment || trunkX >= to.x - minSegment) return undefined;
    return routeFromPoints(
      compactRoutePoints([
        { x: trunkX, y: from.y },
        { x: trunkX, y: to.y }
      ])
    );
  }

  const directDistance = to.y - from.y;
  if (directDistance <= minSegment * 2) return undefined;
  let trunkY = to.y - inset;
  if (trunkY <= from.y + minSegment || trunkY >= to.y - minSegment) {
    trunkY = from.y + directDistance / 2;
  }
  if (trunkY <= from.y + minSegment || trunkY >= to.y - minSegment) return undefined;
  return routeFromPoints(
    compactRoutePoints([
      { x: from.x, y: trunkY },
      { x: to.x, y: trunkY }
    ])
  );
}
