import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../../src/shared/graph';
import {
  getCenteredScrollTarget,
  getNodeScrollTarget,
  getRenderedNodeBounds,
  planCanvasFitToView,
  planCanvasWheelZoom
} from '../../src/renderer/src/canvas-viewport';

const defaultNodeSize = { width: 70, height: 28 };
const nodes: FlowNode[] = [
  { id: 'n1', label: 'A' },
  { id: 'n2', label: 'B' }
];

describe('canvas viewport helpers', () => {
  it('calculates rendered node bounds from available positions and sizes', () => {
    const bounds = getRenderedNodeBounds(
      nodes,
      new Map([
        ['n1', { id: 'n1', x: 20, y: 30 }],
        ['n2', { id: 'n2', x: 180, y: 90 }]
      ]),
      { n2: { width: 100, height: 40 } },
      defaultNodeSize
    );

    expect(bounds).toEqual({ minX: 20, minY: 30, maxX: 280, maxY: 130 });
  });

  it('returns no bounds or fit plan when nodes cannot be measured', () => {
    expect(getRenderedNodeBounds(nodes, new Map(), {}, defaultNodeSize)).toBeNull();
    expect(planCanvasFitToView([], new Map(), {}, defaultNodeSize, { clientWidth: 800, clientHeight: 600 })).toBeNull();
  });

  it('plans fit-to-view zoom and graph center with padding', () => {
    const plan = planCanvasFitToView(
      nodes,
      new Map([
        ['n1', { id: 'n1', x: 0, y: 0 }],
        ['n2', { id: 'n2', x: 300, y: 100 }]
      ]),
      {},
      defaultNodeSize,
      { clientWidth: 800, clientHeight: 600 },
      100
    );

    expect(plan).toEqual({
      zoom: 1.25,
      center: { x: 185, y: 64 }
    });
  });

  it('clamps centered scroll targets to scrollable bounds', () => {
    expect(
      getCenteredScrollTarget(
        { x: 500, y: 300 },
        1.5,
        { clientWidth: 400, clientHeight: 200 },
        { scrollWidth: 900, scrollHeight: 500 }
      )
    ).toEqual({ left: 500, top: 300 });

    expect(
      getCenteredScrollTarget(
        { x: 20, y: 10 },
        1,
        { clientWidth: 400, clientHeight: 200 },
        { scrollWidth: 900, scrollHeight: 500 }
      )
    ).toEqual({ left: 0, top: 0 });
  });

  it('centers a single node in the canvas viewport', () => {
    expect(
      getNodeScrollTarget({ id: 'n1', x: 200, y: 120 }, defaultNodeSize, 1.25, { clientWidth: 300, clientHeight: 200 })
    ).toEqual({ left: 143.75, top: 67.5 });
  });

  it('keeps the pointer anchored while zooming with the wheel', () => {
    const zoomIn = planCanvasWheelZoom(1, -1, { x: 100, y: 80 }, { left: 300, top: 120 });
    expect(zoomIn?.zoom).toBe(1.1);
    expect(zoomIn?.scroll.left).toBeCloseTo(340);
    expect(zoomIn?.scroll.top).toBeCloseTo(140);

    expect(planCanvasWheelZoom(2.5, -1, { x: 0, y: 0 }, { left: 0, top: 0 })).toBeNull();
    expect(planCanvasWheelZoom(0.5, 1, { x: 0, y: 0 }, { left: 0, top: 0 })).toBeNull();
  });
});
