import { describe, expect, it } from 'vitest';
import {
  planConnectDragFinish,
  updateConnectDragForPoint,
  type ConnectDragState
} from '../../src/renderer/src/connect-dragging';
import { HANDLE_CONNECT_ANCHORS } from '../../src/renderer/src/connect-anchors';

function drag(patch: Partial<ConnectDragState> = {}): ConnectDragState {
  return {
    fromNodeId: 'n1',
    anchors: HANDLE_CONNECT_ANCHORS,
    start: { x: 10, y: 20 },
    current: { x: 10, y: 20 },
    hoverTargetNodeId: null,
    ...patch
  };
}

describe('connect dragging helpers', () => {
  it('updates current pointer and ignores the source node as a hover target', () => {
    expect(updateConnectDragForPoint(drag(), { x: 30, y: 40 }, 'n1')).toMatchObject({
      current: { x: 30, y: 40 },
      hoverTargetNodeId: null
    });

    expect(updateConnectDragForPoint(drag(), { x: 50, y: 60 }, 'n2')).toMatchObject({
      current: { x: 50, y: 60 },
      hoverTargetNodeId: 'n2'
    });
  });

  it('uses handle, viewport, hover, canvas, then event targets in priority order', () => {
    expect(
      planConnectDragFinish(drag(), {
        handleTargetNodeId: 'n2',
        viewportTargetNodeId: 'n3',
        hoverTargetNodeId: 'n4',
        canvasTargetNodeId: 'n5',
        eventTargetNodeId: 'n6',
        handleAnchor: 'front'
      })
    ).toEqual({
      fromNodeId: 'n1',
      targetNodeId: 'n2',
      anchors: { from: 'back', to: 'front' }
    });

    expect(
      planConnectDragFinish(drag(), {
        viewportTargetNodeId: 'n3',
        hoverTargetNodeId: 'n4',
        canvasTargetNodeId: 'n5',
        eventTargetNodeId: 'n6'
      })?.targetNodeId
    ).toBe('n3');

    expect(planConnectDragFinish(drag(), { hoverTargetNodeId: 'n4' })?.targetNodeId).toBe('n4');
    expect(planConnectDragFinish(drag(), { canvasTargetNodeId: 'n5' })?.targetNodeId).toBe('n5');
    expect(planConnectDragFinish(drag(), { eventTargetNodeId: 'n6' })?.targetNodeId).toBe('n6');
  });

  it('falls back to the opposite target anchor when no valid handle anchor is provided', () => {
    expect(planConnectDragFinish(drag(), { viewportTargetNodeId: 'n2' })).toEqual({
      fromNodeId: 'n1',
      targetNodeId: 'n2',
      anchors: { from: 'back', to: 'front' }
    });
  });

  it('blocks drops onto the source node and same-side handle connections', () => {
    expect(planConnectDragFinish(drag(), { viewportTargetNodeId: 'n1' })).toBeNull();
    expect(
      planConnectDragFinish(drag(), {
        handleTargetNodeId: 'n2',
        handleAnchor: 'back'
      })
    ).toBeNull();
  });

  it('keeps front source connections opposite to target handles', () => {
    expect(
      planConnectDragFinish(drag({ anchors: { from: 'front', to: 'body' } }), {
        handleTargetNodeId: 'n2',
        handleAnchor: 'back'
      })
    ).toEqual({
      fromNodeId: 'n1',
      targetNodeId: 'n2',
      anchors: { from: 'front', to: 'back' }
    });
  });
});
