import {
  validateEdge,
  type EdgeAnchors,
  type EdgeRole,
  type FlowDoc,
  type NodeId
} from '../../shared/graph';
import { isNodeSideAnchor, reverseEdgeAnchors } from './connect-anchors';
import { collectConnectedComponent } from './graph-analysis';

export type EdgeConnectionPlan =
  | {
      ok: true;
      from: NodeId;
      to: NodeId;
      role: EdgeRole;
      anchors?: EdgeAnchors;
      mergedComponentNodeIds: NodeId[] | null;
      shouldNormalizeAttachedRoot: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export function planEdgeConnection(
  doc: FlowDoc,
  from: NodeId,
  to: NodeId,
  primaryRootNodeId: NodeId | null,
  rootNodeIds: Set<NodeId>,
  anchors?: EdgeAnchors
): EdgeConnectionPlan {
  if ((anchors?.from === 'front' && anchors.to === 'front') || (anchors?.from === 'back' && anchors.to === 'back')) {
    return { ok: false, message: 'Connect blocked: use opposite node handles' };
  }

  let nextFrom = from;
  let nextTo = to;
  let nextAnchors = anchors;
  const sameComponentBeforeConnect = new Set(collectConnectedComponent(doc, from)).has(to);
  const isExplicitOppositeHandleConnection = Boolean(
    isNodeSideAnchor(anchors?.from) && isNodeSideAnchor(anchors.to) && anchors.from !== anchors.to
  );

  if (from === primaryRootNodeId && to !== from && isExplicitOppositeHandleConnection) {
    nextFrom = to;
    nextTo = from;
    nextAnchors = reverseEdgeAnchors(anchors);
  } else if (to === primaryRootNodeId && from !== to && !sameComponentBeforeConnect) {
    nextFrom = to;
    nextTo = from;
    nextAnchors = reverseEdgeAnchors(anchors);
  }

  const fromComponent = new Set(collectConnectedComponent(doc, nextFrom));
  const mergesTwoComponents = !fromComponent.has(nextTo);
  const mergedComponentNodeIds = mergesTwoComponents
    ? [...new Set([...fromComponent, ...collectConnectedComponent(doc, nextTo)])]
    : null;
  const role: EdgeRole = mergesTwoComponents ? 'layout' : 'manual';
  const validation = validateEdge(doc, nextFrom, nextTo, role, nextAnchors);

  if (!validation.ok) {
    if (validation.reason === 'self-edge') return { ok: false, message: 'Connect blocked: source and target are the same node' };
    if (validation.reason === 'duplicate-edge') return { ok: false, message: 'Connect blocked: edge already exists' };
    if (validation.reason === 'same-side-anchors') return { ok: false, message: 'Connect blocked: use opposite node handles' };
    return { ok: false, message: 'Connect blocked: target node is unavailable' };
  }

  return {
    ok: true,
    from: nextFrom,
    to: nextTo,
    role,
    ...(nextAnchors ? { anchors: nextAnchors } : {}),
    mergedComponentNodeIds,
    shouldNormalizeAttachedRoot: rootNodeIds.has(nextTo) && nextTo !== primaryRootNodeId
  };
}
