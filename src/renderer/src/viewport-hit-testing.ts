import type { EdgeAnchor, NodeId } from '../../shared/graph';
import type { LayoutDirection } from '../../shared/layout';

export type ConnectHandleHit = { nodeId: NodeId; anchor: EdgeAnchor };

export function getNodeIdFromEventTarget(target: EventTarget | null | undefined): NodeId | null {
  if (!target || !(target instanceof Element)) return null;
  const nodeEl = target.closest('[data-testid^="node-"]') as HTMLElement | null;
  if (!nodeEl) return null;
  const testId = nodeEl.dataset.testid || nodeEl.getAttribute('data-testid');
  if (!testId || !testId.startsWith('node-')) return null;
  const nodeId = testId.slice(5);
  return nodeId.length > 0 ? nodeId : null;
}

export function getNodeIdFromViewportPoint(clientX: number, clientY: number): NodeId | null {
  const el = document.elementFromPoint(clientX, clientY);
  return getNodeIdFromEventTarget(el);
}

export function isNodeLabelInputTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.node-label-input'));
}

export function getViewportConnectHandleHit(
  clientX: number,
  clientY: number,
  nodeId: NodeId,
  direction: LayoutDirection
): ConnectHandleHit | null {
  const nodeEl = document.querySelector(`[data-testid="node-${nodeId}"]`);
  if (!(nodeEl instanceof HTMLElement)) return null;
  const rect = nodeEl.getBoundingClientRect();
  if (direction === 'horizontal') {
    const withinY = clientY >= rect.top - 8 && clientY <= rect.bottom + 8;
    if (Math.abs(clientX - rect.right) <= 14 && withinY) return { nodeId, anchor: 'back' };
    if (Math.abs(clientX - rect.left) <= 14 && withinY) return { nodeId, anchor: 'front' };
    return null;
  }
  const withinX = clientX >= rect.left - 8 && clientX <= rect.right + 8;
  if (Math.abs(clientY - rect.bottom) <= 14 && withinX) return { nodeId, anchor: 'back' };
  if (Math.abs(clientY - rect.top) <= 14 && withinX) return { nodeId, anchor: 'front' };
  return null;
}

export function isViewportPointOnConnectHandle(
  clientX: number,
  clientY: number,
  nodeId: NodeId,
  direction: LayoutDirection
) {
  return Boolean(getViewportConnectHandleHit(clientX, clientY, nodeId, direction));
}

export function getConnectHandleHitFromViewportPoint(
  clientX: number,
  clientY: number,
  direction: LayoutDirection
): ConnectHandleHit | null {
  const nodeEls = Array.from(document.querySelectorAll('[data-testid^="node-"]'));
  for (const nodeEl of nodeEls) {
    if (!(nodeEl instanceof HTMLElement)) continue;
    const testId = nodeEl.dataset.testid || nodeEl.getAttribute('data-testid');
    const nodeId = testId?.replace(/^node-/, '') as NodeId | undefined;
    if (!nodeId) continue;
    const hit = getViewportConnectHandleHit(clientX, clientY, nodeId, direction);
    if (hit) {
      return hit;
    }
  }
  return null;
}
