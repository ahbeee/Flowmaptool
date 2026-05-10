import { describe, expect, it } from 'vitest';
import { adjustRouteForEndpointChange } from '../../src/renderer/src/edge-route-preservation';

describe('edge route preservation', () => {
  it('keeps the selected horizontal lane while stretching the source stem', () => {
    const route = {
      points: [
        { x: 360, y: 100 },
        { x: 360, y: 40 },
        { x: 40, y: 40 },
        { x: 40, y: 120 }
      ]
    };

    expect(
      adjustRouteForEndpointChange(
        route,
        { from: { x: 320, y: 100 }, to: { x: 80, y: 120 } },
        { from: { x: 390, y: 100 }, to: { x: 80, y: 120 } },
        'horizontal'
      )
    ).toEqual({
      points: [
        { x: 430, y: 100 },
        { x: 430, y: 40 },
        { x: 40, y: 40 },
        { x: 40, y: 120 }
      ]
    });
  });

  it('keeps the selected horizontal lane while stretching the target stem', () => {
    const route = {
      points: [
        { x: 360, y: 100 },
        { x: 360, y: 40 },
        { x: 40, y: 40 },
        { x: 40, y: 120 }
      ]
    };

    expect(
      adjustRouteForEndpointChange(
        route,
        { from: { x: 320, y: 100 }, to: { x: 80, y: 120 } },
        { from: { x: 320, y: 100 }, to: { x: 60, y: 150 } },
        'horizontal'
      )
    ).toEqual({
      points: [
        { x: 360, y: 100 },
        { x: 360, y: 40 },
        { x: 20, y: 40 },
        { x: 20, y: 150 }
      ]
    });
  });

  it('keeps the selected vertical lane while stretching endpoint stems', () => {
    const route = {
      points: [
        { x: 100, y: 360 },
        { x: 40, y: 360 },
        { x: 40, y: 40 },
        { x: 120, y: 40 }
      ]
    };

    expect(
      adjustRouteForEndpointChange(
        route,
        { from: { x: 100, y: 320 }, to: { x: 120, y: 80 } },
        { from: { x: 100, y: 390 }, to: { x: 150, y: 60 } },
        'vertical'
      )
    ).toEqual({
      points: [
        { x: 100, y: 430 },
        { x: 40, y: 430 },
        { x: 40, y: 20 },
        { x: 150, y: 20 }
      ]
    });
  });
});
