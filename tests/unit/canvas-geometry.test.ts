import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc } from '../../src/shared/graph';
import type { NodeSizeMap } from '../../src/shared/layout';
import {
  buildDragInsertPreviewRect,
  buildNodeBoxMap,
  buildRouteScopeNodeIdsByNodeId,
  getCanvasSize,
  getMarqueeSelectedNodeIds,
  getNodeIdAtCanvasPoint,
  getScopedRouteNodeBoxes
} from '../../src/renderer/src/canvas-geometry';

const defaultSize = { width: 70, height: 28 };
const positions = new Map([
  ['n1', { id: 'n1', x: 10, y: 20 }],
  ['n2', { id: 'n2', x: 200, y: 40 }],
  ['n3', { id: 'n3', x: 400, y: 80 }]
]);
const nodeSizes: NodeSizeMap = {
  n1: { width: 100, height: 40 },
  n3: { width: 80, height: 60 }
};

function createDoc() {
  let doc = createEmptyDoc();
  doc = addNode(doc, 'A');
  doc = addNode(doc, 'B');
  doc = addNode(doc, 'C');
  doc = addEdge(doc, 'n1', 'n2');
  doc = addEdge(doc, 'n2', 'n3');
  return doc;
}

describe('canvas geometry helpers', () => {
  it('builds node boxes from rendered positions and sizes', () => {
    const boxes = buildNodeBoxMap([{ id: 'n1' }, { id: 'n2' }, { id: 'missing' }], positions, nodeSizes, defaultSize);

    expect(boxes.get('n1')).toEqual({ left: 10, right: 110, top: 20, bottom: 60 });
    expect(boxes.get('n2')).toEqual({ left: 200, right: 270, top: 40, bottom: 68 });
    expect(boxes.has('missing')).toBe(false);
  });

  it('maps each node to its layout-edge route scope', () => {
    const scopes = buildRouteScopeNodeIdsByNodeId(createDoc(), new Set(['e1']));

    expect(scopes.get('n1')?.sort()).toEqual(['n1', 'n2']);
    expect(scopes.get('n2')?.sort()).toEqual(['n1', 'n2']);
    expect(scopes.get('n3')).toEqual(['n3']);
  });

  it('returns scoped route boxes and falls back to all boxes when none are scoped', () => {
    const boxes = buildNodeBoxMap([{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }], positions, nodeSizes, defaultSize);
    const scopes = buildRouteScopeNodeIdsByNodeId(createDoc(), new Set(['e1']));

    expect([...getScopedRouteNodeBoxes({ id: 'e1', from: 'n1', to: 'n2' }, boxes, scopes).keys()].sort()).toEqual([
      'n1',
      'n2'
    ]);
    expect(getScopedRouteNodeBoxes({ id: 'e3', from: 'missing-a', to: 'missing-b' }, boxes, scopes)).toBe(boxes);
  });

  it('computes canvas size with minimums and padding', () => {
    expect(getCanvasSize([{ id: 'n1' }], positions, nodeSizes, defaultSize)).toEqual({ width: 980, height: 520 });
    expect(getCanvasSize([{ id: 'n3' }], positions, nodeSizes, defaultSize, { width: 100, height: 100 }, 120)).toEqual({
      width: 600,
      height: 260
    });
  });

  it('builds horizontal and vertical layer insertion preview rectangles', () => {
    const basePositions = [
      { id: 'n1', x: 80, y: 80 },
      { id: 'n2', x: 80, y: 180 },
      { id: 'n3', x: 80, y: 280 },
      { id: 'n4', x: 300, y: 80 }
    ];
    const rendered = new Map(basePositions.map(pos => [pos.id, pos]));

    expect(
      buildDragInsertPreviewRect(
        { nodeIds: ['n3'], anchorNodeId: 'n3' },
        basePositions,
        { n3: { dx: 0, dy: -220 } },
        rendered,
        {},
        defaultSize,
        'horizontal',
        100
      )
    ).toEqual({ left: 72, top: 79, width: 86, height: 2 });

    expect(
      buildDragInsertPreviewRect(
        { nodeIds: ['n1'], anchorNodeId: 'n1' },
        [
          { id: 'n1', x: 80, y: 80 },
          { id: 'n2', x: 180, y: 80 },
          { id: 'n3', x: 280, y: 80 }
        ],
        { n1: { dx: 220, dy: 0 } },
        new Map([
          ['n1', { id: 'n1', x: 300, y: 80 }],
          ['n2', { id: 'n2', x: 180, y: 80 }],
          ['n3', { id: 'n3', x: 280, y: 80 }]
        ]),
        {},
        defaultSize,
        'vertical',
        100
      )
    ).toEqual({ left: 279, top: 72, width: 2, height: 44 });
  });

  it('selects nodes intersecting a marquee regardless of drag direction', () => {
    expect(
      getMarqueeSelectedNodeIds(
        { startX: 260, startY: 100, currentX: 50, currentY: 10 },
        [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }, { id: 'missing' }],
        positions,
        nodeSizes,
        defaultSize
      )
    ).toEqual(['n1', 'n2']);
  });

  it('finds the topmost node at a canvas point and supports exclusions', () => {
    const orderedPositions = [
      { id: 'n1', x: 10, y: 20 },
      { id: 'n2', x: 40, y: 30 },
      { id: 'n3', x: 400, y: 80 }
    ];
    const rendered = new Map([
      ['n1', { id: 'n1', x: 10, y: 20 }],
      ['n2', { id: 'n2', x: 40, y: 30 }],
      ['n3', { id: 'n3', x: 400, y: 80 }]
    ]);

    expect(getNodeIdAtCanvasPoint({ x: 50, y: 40 }, orderedPositions, rendered, nodeSizes, defaultSize)).toBe('n2');
    expect(getNodeIdAtCanvasPoint({ x: 50, y: 40 }, orderedPositions, rendered, nodeSizes, defaultSize, ['n2'])).toBe(
      'n1'
    );
    expect(getNodeIdAtCanvasPoint({ x: 350, y: 40 }, orderedPositions, rendered, nodeSizes, defaultSize)).toBeNull();
  });
});
