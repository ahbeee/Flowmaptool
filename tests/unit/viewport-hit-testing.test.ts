import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getConnectHandleHitFromViewportPoint,
  getNodeIdFromEventTarget,
  getNodeIdFromViewportPoint,
  getViewportConnectHandleHit,
  isNodeLabelInputTarget,
  isViewportPointOnConnectHandle
} from '../../src/renderer/src/viewport-hit-testing';

type Rect = { left: number; right: number; top: number; bottom: number };

class FakeElement {
  dataset: Record<string, string> = {};
  parent: FakeElement | null = null;
  classNames = new Set<string>();

  constructor(
    testId: string | null,
    private rect: Rect = { left: 0, right: 0, top: 0, bottom: 0 }
  ) {
    if (testId) this.dataset.testid = testId;
  }

  closest(selector: string) {
    let current: FakeElement | null = this;
    while (current) {
      if (selector === '[data-testid^="node-"]' && current.dataset.testid?.startsWith('node-')) return current;
      if (selector === '.node-label-input' && current.classNames.has('node-label-input')) return current;
      current = current.parent;
    }
    return null;
  }

  getAttribute(name: string) {
    return name === 'data-testid' ? this.dataset.testid || null : null;
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

const originalElement = globalThis.Element;
const originalHTMLElement = globalThis.HTMLElement;
const originalDocument = globalThis.document;

function installFakeDom(nodes: FakeElement[], elementFromPoint: FakeElement | null = null) {
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeElement });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      elementFromPoint: () => elementFromPoint,
      querySelector: (selector: string) => {
        const match = selector.match(/^\[data-testid="(.+)"\]$/);
        if (!match) return null;
        return nodes.find(node => node.dataset.testid === match[1]) || null;
      },
      querySelectorAll: (selector: string) =>
        selector === '[data-testid^="node-"]' ? nodes.filter(node => node.dataset.testid?.startsWith('node-')) : []
    }
  });
}

describe('viewport hit testing helpers', () => {
  beforeEach(() => {
    installFakeDom([]);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'Element', { configurable: true, value: originalElement });
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: originalHTMLElement });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  });

  it('resolves node ids from event targets and viewport points', () => {
    const node = new FakeElement('node-n2');
    const child = new FakeElement(null);
    child.parent = node;
    installFakeDom([node], child);

    expect(getNodeIdFromEventTarget(child as unknown as EventTarget)).toBe('n2');
    expect(getNodeIdFromViewportPoint(20, 30)).toBe('n2');
    expect(getNodeIdFromEventTarget(new FakeElement('edge-e1') as unknown as EventTarget)).toBeNull();
  });

  it('detects node label input targets through ancestors', () => {
    const input = new FakeElement(null);
    input.classNames.add('node-label-input');
    const child = new FakeElement(null);
    child.parent = input;

    expect(isNodeLabelInputTarget(child as unknown as EventTarget)).toBe(true);
    expect(isNodeLabelInputTarget(new FakeElement(null) as unknown as EventTarget)).toBe(false);
  });

  it('detects horizontal and vertical connect handle hits', () => {
    const node = new FakeElement('node-n1', { left: 100, right: 180, top: 50, bottom: 90 });
    installFakeDom([node]);

    expect(getViewportConnectHandleHit(181, 70, 'n1', 'horizontal')).toEqual({ nodeId: 'n1', anchor: 'back' });
    expect(getViewportConnectHandleHit(99, 70, 'n1', 'horizontal')).toEqual({ nodeId: 'n1', anchor: 'front' });
    expect(getViewportConnectHandleHit(140, 91, 'n1', 'vertical')).toEqual({ nodeId: 'n1', anchor: 'back' });
    expect(getViewportConnectHandleHit(140, 49, 'n1', 'vertical')).toEqual({ nodeId: 'n1', anchor: 'front' });
    expect(isViewportPointOnConnectHandle(140, 70, 'n1', 'horizontal')).toBe(false);
  });

  it('scans visible nodes for a connect handle hit', () => {
    const first = new FakeElement('node-n1', { left: 0, right: 50, top: 0, bottom: 30 });
    const second = new FakeElement('node-n2', { left: 100, right: 160, top: 0, bottom: 30 });
    installFakeDom([first, second]);

    expect(getConnectHandleHitFromViewportPoint(161, 20, 'horizontal')).toEqual({ nodeId: 'n2', anchor: 'back' });
    expect(getConnectHandleHitFromViewportPoint(80, 20, 'horizontal')).toBeNull();
  });
});
