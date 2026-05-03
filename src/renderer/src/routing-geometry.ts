import type { NodeId } from '@shared/graph';

export type Point = { x: number; y: number };
export type NodeBox = { left: number; right: number; top: number; bottom: number };

export function routeLength(points: Point[]): number {
  return points.slice(1).reduce((total, point, index) => total + Math.sqrt(distanceSquared(points[index], point)), 0);
}

export function pointInsideBox(point: Point, box: NodeBox): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
  const epsilon = 0.0001;
  if (Math.abs(o1) <= epsilon && onSegment(a, c, b)) return true;
  if (Math.abs(o2) <= epsilon && onSegment(a, d, b)) return true;
  if (Math.abs(o3) <= epsilon && onSegment(c, a, d)) return true;
  if (Math.abs(o4) <= epsilon && onSegment(c, b, d)) return true;
  return false;
}

export function segmentIntersectsBox(from: Point, to: Point, box: NodeBox, padding = 8): boolean {
  const expanded = {
    left: box.left - padding,
    right: box.right + padding,
    top: box.top - padding,
    bottom: box.bottom + padding
  };
  if (pointInsideBox(from, expanded) || pointInsideBox(to, expanded)) return true;
  const corners = [
    { x: expanded.left, y: expanded.top },
    { x: expanded.right, y: expanded.top },
    { x: expanded.right, y: expanded.bottom },
    { x: expanded.left, y: expanded.bottom }
  ];
  return corners.some((corner, index) => segmentsIntersect(from, to, corner, corners[(index + 1) % corners.length]));
}

export function distancePointToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return Math.sqrt(distanceSquared(point, from));
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  const projection = { x: from.x + t * dx, y: from.y + t * dy };
  return Math.sqrt(distanceSquared(point, projection));
}

export function distancePointToBox(point: Point, box: NodeBox): number {
  const dx = point.x < box.left ? box.left - point.x : point.x > box.right ? point.x - box.right : 0;
  const dy = point.y < box.top ? box.top - point.y : point.y > box.bottom ? point.y - box.bottom : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

export function segmentBoxDistance(from: Point, to: Point, box: NodeBox): number {
  if (segmentIntersectsBox(from, to, box, 0)) return 0;
  const epsilon = 0.001;
  if (Math.abs(from.y - to.y) <= epsilon) {
    const y = from.y;
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    const dx = maxX < box.left ? box.left - maxX : minX > box.right ? minX - box.right : 0;
    const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
    return Math.sqrt(dx * dx + dy * dy);
  }
  if (Math.abs(from.x - to.x) <= epsilon) {
    const x = from.x;
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
    const dy = maxY < box.top ? box.top - maxY : minY > box.bottom ? minY - box.bottom : 0;
    return Math.sqrt(dx * dx + dy * dy);
  }
  const corners = [
    { x: box.left, y: box.top },
    { x: box.right, y: box.top },
    { x: box.right, y: box.bottom },
    { x: box.left, y: box.bottom }
  ];
  return Math.min(
    distancePointToBox(from, box),
    distancePointToBox(to, box),
    ...corners.map(corner => distancePointToSegment(corner, from, to))
  );
}

export function routeObstacleCount(points: Point[], fromId: NodeId, toId: NodeId, nodeBoxes: Map<NodeId, NodeBox>): number {
  let count = 0;
  const obstacles = [...nodeBoxes.entries()].filter(([id]) => id !== fromId && id !== toId);
  for (let i = 0; i < points.length - 1; i++) {
    for (const [, box] of obstacles) {
      if (segmentIntersectsBox(points[i], points[i + 1], box)) count += 1;
    }
  }
  return count;
}

export function routeClearancePenalty(points: Point[], fromId: NodeId, toId: NodeId, nodeBoxes: Map<NodeId, NodeBox>): number {
  let penalty = 0;
  const desiredClearance = 96;
  const obstacles = [...nodeBoxes.entries()].filter(([id]) => id !== fromId && id !== toId);
  for (let i = 0; i < points.length - 1; i++) {
    for (const [, box] of obstacles) {
      const missingClearance = Math.max(0, desiredClearance - segmentBoxDistance(points[i], points[i + 1], box));
      penalty += missingClearance * missingClearance;
    }
  }
  return penalty;
}

export function routeTurnCount(points: Point[]): number {
  let count = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const prevHorizontal = Math.abs(prev.y - current.y) <= 0.001;
    const nextHorizontal = Math.abs(current.y - next.y) <= 0.001;
    if (prevHorizontal !== nextHorizontal) count += 1;
  }
  return count;
}

export function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distanceToSegmentSquared(point: Point, start: Point, end: Point): number {
  const lengthSquared = distanceSquared(start, end);
  if (lengthSquared === 0) return distanceSquared(point, start);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / lengthSquared)
  );
  const projected = {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y)
  };
  return distanceSquared(point, projected);
}
