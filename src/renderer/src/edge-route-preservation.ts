import type { LayoutDirection } from '../../shared/layout';
import type { EdgeRoute } from './persistence';
import type { Point } from './routing-geometry';

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1;
}

export function adjustRouteForEndpointChange(
  route: EdgeRoute,
  before: { from: Point; to: Point },
  after: { from: Point; to: Point },
  direction: LayoutDirection
): EdgeRoute {
  if (route.points.length === 0) return route;
  const points = route.points.map(point => ({ ...point }));
  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  const sourceDelta = { x: after.from.x - before.from.x, y: after.from.y - before.from.y };
  const targetDelta = { x: after.to.x - before.to.x, y: after.to.y - before.to.y };
  if (
    Math.abs(sourceDelta.x) <= 0.5 &&
    Math.abs(sourceDelta.y) <= 0.5 &&
    Math.abs(targetDelta.x) <= 0.5 &&
    Math.abs(targetDelta.y) <= 0.5
  ) {
    return route;
  }

  if (route.points.length === 1) {
    points[0] = {
      x: points[0].x + (sourceDelta.x + targetDelta.x) / 2,
      y: points[0].y + (sourceDelta.y + targetDelta.y) / 2
    };
    return { points };
  }

  if (direction === 'horizontal') {
    for (let index = 0; index < points.length && nearlyEqual(route.points[index].x, first.x); index += 1) {
      points[index].x += sourceDelta.x;
      if (nearlyEqual(route.points[index].y, before.from.y)) points[index].y += sourceDelta.y;
    }
    for (let index = points.length - 1; index >= 0 && nearlyEqual(route.points[index].x, last.x); index -= 1) {
      points[index].x += targetDelta.x;
      if (nearlyEqual(route.points[index].y, before.to.y)) points[index].y += targetDelta.y;
    }
    return { points };
  }

  for (let index = 0; index < points.length && nearlyEqual(route.points[index].y, first.y); index += 1) {
    points[index].y += sourceDelta.y;
    if (nearlyEqual(route.points[index].x, before.from.x)) points[index].x += sourceDelta.x;
  }
  for (let index = points.length - 1; index >= 0 && nearlyEqual(route.points[index].y, last.y); index -= 1) {
    points[index].y += targetDelta.y;
    if (nearlyEqual(route.points[index].x, before.to.x)) points[index].x += targetDelta.x;
  }
  return { points };
}
