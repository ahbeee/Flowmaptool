import type { EdgeAnchor, EdgeAnchors } from '@shared/graph';

export const HANDLE_CONNECT_ANCHORS: EdgeAnchors = { from: 'back', to: 'body' };
export const FRONT_HANDLE_CONNECT_ANCHORS: EdgeAnchors = { from: 'front', to: 'body' };

export function reverseEdgeAnchors(anchors: EdgeAnchors | undefined): EdgeAnchors | undefined {
  if (!anchors) return undefined;
  return {
    ...(anchors.to ? { from: anchors.to } : {}),
    ...(anchors.from ? { to: anchors.from } : {})
  };
}

export function isNodeSideAnchor(anchor: EdgeAnchors['from'] | undefined): anchor is 'front' | 'back' {
  return anchor === 'front' || anchor === 'back';
}

export function oppositeNodeSideAnchor(anchor: 'front' | 'back'): 'front' | 'back' {
  return anchor === 'front' ? 'back' : 'front';
}

export function resolveDraggedEdgeAnchors(sourceAnchors: EdgeAnchors, targetAnchor?: EdgeAnchor): EdgeAnchors | null {
  const sourceAnchor = sourceAnchors.from === 'front' ? 'front' : 'back';
  const resolvedTargetAnchor =
    targetAnchor && targetAnchor !== 'body' && targetAnchor !== 'auto'
      ? targetAnchor
      : oppositeNodeSideAnchor(sourceAnchor);
  if (sourceAnchor === resolvedTargetAnchor) return null;
  return { ...sourceAnchors, to: resolvedTargetAnchor };
}
