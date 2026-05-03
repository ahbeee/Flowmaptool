import type { LayoutDirection, NodeSize } from '@shared/layout';
import type { EdgeBend, EdgeRoute } from './persistence';
import {
  distanceSquared,
  distanceToSegmentSquared,
  routeLength,
  type Point
} from './routing-geometry';

export function shouldBendEdge(
  from: Point,
  to: Point,
  direction: LayoutDirection,
  _fromSize: NodeSize,
  _toSize: NodeSize
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (direction === 'horizontal') return Math.abs(dy) > 2;
  return Math.abs(dx) > 2;
}

export function edgePath(
  from: Point,
  to: Point,
  lane: number,
  direction: LayoutDirection,
  fromSize: NodeSize,
  toSize: NodeSize,
  forceBend = false,
  manualRoute?: EdgeRoute
): string {
  if (manualRoute && manualRoute.points.length > 0) {
    if (manualRoute.points.length === 1) {
      const bend = manualRoute.points[0];
      return `M ${from.x} ${from.y} Q ${bend.x} ${bend.y} ${to.x} ${to.y}`;
    }
    return roundedRoutePath([from, ...manualRoute.points, to]);
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!forceBend && !shouldBendEdge(from, to, direction, fromSize, toSize)) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  if (direction === 'horizontal') {
    const handleX = Math.max(18, Math.min(40, Math.abs(dx) * 0.16));
    const midX = from.x + dx / 2;
    const midY = from.y + dy / 2;
    if (!forceBend) {
      return `M ${from.x} ${from.y} C ${from.x + handleX} ${from.y} ${midX - handleX} ${from.y} ${midX} ${midY} C ${midX + handleX} ${to.y} ${to.x - handleX} ${to.y} ${to.x} ${to.y}`;
    }
    const bendBase = Math.min(40, 10 + Math.abs(dx) * 0.06);
    const sign = dy === 0 ? (lane % 2 === 0 ? -1 : 1) : Math.sign(dy);
    const bend = sign * (bendBase + Math.abs(lane) * 10);
    return `M ${from.x} ${from.y} C ${from.x + handleX} ${from.y} ${midX - handleX} ${midY + bend} ${midX} ${midY + bend} C ${midX + handleX} ${midY + bend} ${to.x - handleX} ${to.y} ${to.x} ${to.y}`;
  }
  const handleY = Math.max(18, Math.min(40, Math.abs(dy) * 0.16));
  const midX = from.x + dx / 2;
  const midY = from.y + dy / 2;
  if (!forceBend) {
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + handleY} ${from.x} ${midY - handleY} ${midX} ${midY} C ${to.x} ${midY + handleY} ${to.x} ${to.y - handleY} ${to.x} ${to.y}`;
  }
  const bendBase = Math.min(40, 10 + Math.abs(dy) * 0.06);
  const sign = dx === 0 ? (lane % 2 === 0 ? -1 : 1) : Math.sign(dx);
  const bend = sign * (bendBase + Math.abs(lane) * 10);
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + handleY} ${midX + bend} ${midY - handleY} ${midX + bend} ${midY} C ${midX + bend} ${midY + handleY} ${to.x} ${to.y - handleY} ${to.x} ${to.y}`;
}

function pointAlongSegment(from: Point, to: Point, distance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return to;
  const ratio = Math.min(1, distance / length);
  return {
    x: to.x - dx * ratio,
    y: to.y - dy * ratio
  };
}

function pointAfterCorner(corner: Point, to: Point, distance: number): Point {
  const dx = to.x - corner.x;
  const dy = to.y - corner.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return corner;
  const ratio = Math.min(1, distance / length);
  return {
    x: corner.x + dx * ratio,
    y: corner.y + dy * ratio
  };
}

export function roundedRoutePath(points: Point[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const cornerRadius = 28;
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const prevDistance = Math.sqrt(distanceSquared(prev, corner));
    const nextDistance = Math.sqrt(distanceSquared(corner, next));
    const radius = Math.min(cornerRadius, prevDistance / 2, nextDistance / 2);

    if (radius <= 1) {
      commands.push(`L ${corner.x} ${corner.y}`);
      continue;
    }

    const beforeCorner = pointAlongSegment(prev, corner, radius);
    const afterCorner = pointAfterCorner(corner, next, radius);
    commands.push(`L ${beforeCorner.x} ${beforeCorner.y}`);
    commands.push(`Q ${corner.x} ${corner.y} ${afterCorner.x} ${afterCorner.y}`);
  }

  const last = points[points.length - 1];
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(' ');
}

export function edgeMidpoint(from: Point, to: Point): EdgeBend {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

export function routeControlPoint(from: Point, to: Point, route: EdgeRoute): Point {
  const points = [from, ...route.points, to];
  const totalLength = routeLength(points);
  if (totalLength <= 0) return edgeMidpoint(from, to);

  let remaining = totalLength / 2;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = Math.sqrt(distanceSquared(start, end));
    if (segmentLength === 0) continue;
    if (remaining <= segmentLength) {
      const ratio = remaining / segmentLength;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio
      };
    }
    remaining -= segmentLength;
  }

  return edgeMidpoint(from, to);
}

export function routeFromBend(bend?: EdgeBend): EdgeRoute | undefined {
  return bend ? { points: [bend] } : undefined;
}

export function compactRoutePoints(points: Point[]): Point[] {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > 1 || Math.abs(point.y - previous.y) > 1;
  });
}

function cubicPoint(from: Point, controlA: Point, controlB: Point, to: Point, t: number): Point {
  const inverse = 1 - t;
  const inverseSquared = inverse * inverse;
  const tSquared = t * t;
  return {
    x:
      inverseSquared * inverse * from.x +
      3 * inverseSquared * t * controlA.x +
      3 * inverse * tSquared * controlB.x +
      tSquared * t * to.x,
    y:
      inverseSquared * inverse * from.y +
      3 * inverseSquared * t * controlA.y +
      3 * inverse * tSquared * controlB.y +
      tSquared * t * to.y
  };
}

function quadraticPoint(from: Point, control: Point, to: Point, t: number): Point {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y
  };
}

function samplePath(path: string): Point[] {
  const tokens = path.match(/[MLCQ]|-?\d+(?:\.\d+)?/g) || [];
  const points: Point[] = [];
  let index = 0;
  let current: Point | null = null;

  const readNumber = () => {
    const value = Number(tokens[index]);
    index += 1;
    return value;
  };

  const readPoint = (): Point => ({ x: readNumber(), y: readNumber() });

  while (index < tokens.length) {
    const command = tokens[index];
    index += 1;
    if (command === 'M') {
      current = readPoint();
      points.push(current);
      continue;
    }
    if (!current) break;
    if (command === 'L') {
      current = readPoint();
      points.push(current);
      continue;
    }
    if (command === 'Q') {
      const control = readPoint();
      const to = readPoint();
      for (let step = 1; step <= 18; step += 1) {
        points.push(quadraticPoint(current, control, to, step / 18));
      }
      current = to;
      continue;
    }
    if (command === 'C') {
      const controlA = readPoint();
      const controlB = readPoint();
      const to = readPoint();
      for (let step = 1; step <= 24; step += 1) {
        points.push(cubicPoint(current, controlA, controlB, to, step / 24));
      }
      current = to;
    }
  }

  return points;
}

export function distanceToPathSquared(point: Point, path: string): number {
  const points = samplePath(path);
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return distanceSquared(point, points[0]);

  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    nearest = Math.min(nearest, distanceToSegmentSquared(point, points[index], points[index + 1]));
  }
  return nearest;
}
