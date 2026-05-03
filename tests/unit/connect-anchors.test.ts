import { describe, expect, it } from 'vitest';
import {
  FRONT_HANDLE_CONNECT_ANCHORS,
  HANDLE_CONNECT_ANCHORS,
  isNodeSideAnchor,
  resolveDraggedEdgeAnchors,
  reverseEdgeAnchors
} from '../../src/renderer/src/connect-anchors';

describe('connect anchor helpers', () => {
  it('provides handle anchor defaults', () => {
    expect(HANDLE_CONNECT_ANCHORS).toEqual({ from: 'back', to: 'body' });
    expect(FRONT_HANDLE_CONNECT_ANCHORS).toEqual({ from: 'front', to: 'body' });
  });

  it('reverses edge anchor intent', () => {
    expect(reverseEdgeAnchors(undefined)).toBeUndefined();
    expect(reverseEdgeAnchors({ from: 'front', to: 'back' })).toEqual({ from: 'back', to: 'front' });
    expect(reverseEdgeAnchors({ from: 'back' })).toEqual({ to: 'back' });
  });

  it('recognizes only node side anchors', () => {
    expect(isNodeSideAnchor('front')).toBe(true);
    expect(isNodeSideAnchor('back')).toBe(true);
    expect(isNodeSideAnchor('body')).toBe(false);
    expect(isNodeSideAnchor(undefined)).toBe(false);
  });

  it('resolves dragged target anchors to the opposite side by default', () => {
    expect(resolveDraggedEdgeAnchors({ from: 'back', to: 'body' })).toEqual({ from: 'back', to: 'front' });
    expect(resolveDraggedEdgeAnchors({ from: 'front', to: 'body' }, 'auto')).toEqual({ from: 'front', to: 'back' });
    expect(resolveDraggedEdgeAnchors({ from: 'front', to: 'body' }, 'back')).toEqual({ from: 'front', to: 'back' });
    expect(resolveDraggedEdgeAnchors({ from: 'front', to: 'body' }, 'front')).toBeNull();
  });
});
