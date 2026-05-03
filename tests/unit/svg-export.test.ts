import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createEmptyDoc, updateNodeStyle } from '../../src/shared/graph';
import type { NodeSizeMap } from '../../src/shared/layout';
import {
  buildCanvasSvg,
  buildSvgSnapshot,
  type EdgeEndpointResolver,
  type SvgSnapshot
} from '../../src/renderer/src/svg-export';

const endpointResolver: EdgeEndpointResolver = (_edge, fromPos, toPos, fromSize, toSize) => ({
  from: { x: fromPos.x + fromSize.width, y: fromPos.y + fromSize.height / 2 },
  to: { x: toPos.x, y: toPos.y + toSize.height / 2 }
});

function createDoc() {
  let doc = createEmptyDoc();
  doc = addNode(doc, 'Root');
  doc = addNode(doc, 'Child & <task>');
  doc = addEdge(doc, 'n1', 'n2');
  doc = updateNodeStyle(doc, ['n2'], {
    fontFamily: 'Open Sans',
    fontSize: 14,
    textAlign: 'right',
    shape: 'pill',
    backgroundColor: '#111111',
    textColor: '#eeeeee'
  });
  return {
    ...doc,
    edges: doc.edges.map(edge =>
      edge.id === 'e1' ? { ...edge, style: { width: 3, lineType: 'dashed' as const, color: '#ff0000' } } : edge
    )
  };
}

describe('svg export helpers', () => {
  it('builds a snapshot from visible rendered nodes and edge UI state', () => {
    const doc = createDoc();
    const renderedPositionMap = new Map([
      ['n1', { id: 'n1', x: 10, y: 20 }],
      ['n2', { id: 'n2', x: 180, y: 20 }]
    ]);
    const nodeSizeMap: NodeSizeMap = {
      n1: { width: 100, height: 40 }
    };

    const snapshot = buildSvgSnapshot({
      doc,
      renderedPositionMap,
      nodeSizeMap,
      rootNodeIds: new Set(['n1']),
      edgeRoutes: { e1: { points: [{ x: 130, y: 80 }] } },
      edgeBends: { e1: { x: 140, y: 90 } },
      autoEdgeRouteMap: new Map([['e1', { points: [{ x: 150, y: 100 }] }]]),
      edgeLaneMap: new Map([['e1', 2]]),
      edgeForceBendMap: new Map([['e1', true]]),
      getRenderedEdgeEndpoints: endpointResolver
    });

    expect(snapshot.nodes).toMatchObject([
      { id: 'n1', isRoot: true, x: 10, y: 20, width: 100, height: 40 },
      { id: 'n2', isRoot: false, x: 180, y: 20, width: 70, height: 28 }
    ]);
    expect(snapshot.edges).toHaveLength(1);
    expect(snapshot.edges[0]).toMatchObject({
      id: 'e1',
      from: { x: 110, y: 40 },
      to: { x: 180, y: 34 },
      lane: 2,
      forceBend: true,
      style: { width: 3, lineType: 'dashed', color: '#ff0000' },
      route: { points: [{ x: 130, y: 80 }] }
    });
  });

  it('falls back from manual routes to bends and then auto routes', () => {
    const doc = createDoc();
    const renderedPositionMap = new Map([
      ['n1', { id: 'n1', x: 0, y: 0 }],
      ['n2', { id: 'n2', x: 120, y: 0 }]
    ]);

    const fromBend = buildSvgSnapshot({
      doc,
      renderedPositionMap,
      nodeSizeMap: {},
      rootNodeIds: new Set(),
      edgeRoutes: {},
      edgeBends: { e1: { x: 80, y: 60 } },
      autoEdgeRouteMap: new Map([['e1', { points: [{ x: 90, y: 70 }] }]]),
      edgeLaneMap: new Map(),
      edgeForceBendMap: new Map(),
      getRenderedEdgeEndpoints: endpointResolver
    });
    const fromAuto = buildSvgSnapshot({
      doc,
      renderedPositionMap,
      nodeSizeMap: {},
      rootNodeIds: new Set(),
      edgeRoutes: {},
      edgeBends: {},
      autoEdgeRouteMap: new Map([['e1', { points: [{ x: 90, y: 70 }] }]]),
      edgeLaneMap: new Map(),
      edgeForceBendMap: new Map(),
      getRenderedEdgeEndpoints: endpointResolver
    });

    expect(fromBend.edges[0].route).toEqual({ points: [{ x: 80, y: 60 }] });
    expect(fromAuto.edges[0].route).toEqual({ points: [{ x: 90, y: 70 }] });
  });

  it('renders themed SVG markup with escaping, dash styles, and fit-to-content bounds', () => {
    const snapshot: SvgSnapshot = {
      nodes: [
        {
          id: 'n1',
          label: 'A&B <Root>',
          style: { shape: 'rounded', fontFamily: 'A&B Font' },
          isRoot: true,
          x: 20,
          y: 10,
          width: 100,
          height: 40
        },
        {
          id: 'n2',
          label: 'Child',
          style: { shape: 'underline', textAlign: 'center' },
          isRoot: false,
          x: 180,
          y: 20,
          width: 80,
          height: 30
        }
      ],
      edges: [
        {
          id: 'e1',
          from: { x: 120, y: 30 },
          to: { x: 180, y: 35 },
          lane: 0,
          fromSize: { width: 100, height: 40 },
          toSize: { width: 80, height: 30 },
          forceBend: false,
          style: { width: 2, lineType: 'dotted', color: '#123456' },
          route: { points: [{ x: 150, y: -20 }] }
        }
      ]
    };

    const svg = buildCanvasSvg(snapshot, {
      canvasSize: { width: 980, height: 520 },
      theme: {
        canvas: '#ffffff',
        edge: '#222222',
        nodeBg: '#eeeeee',
        nodeText: '#111111',
        rootBg: '#dddddd',
        rootText: '#000000'
      },
      defaultShape: 'plain',
      layoutDirection: 'horizontal',
      fitToContent: true
    });

    expect(svg).toContain('width="336" height="166" viewBox="0 0 336 166"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke-dasharray="1 6"');
    expect(svg).toContain('A&amp;B &lt;Root&gt;');
    expect(svg).toContain('font-family="A&amp;B Font, sans-serif"');
    expect(svg).toContain('<line x1="0"');
    expect(svg).toContain('transform="translate(48,78)"');
  });
});
