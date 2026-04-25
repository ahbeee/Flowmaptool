import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('manual cycle edge does not reflow existing node positions', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const createChild = async (parentId: string) => {
    const parent = window.getByTestId(`node-${parentId}`);
    await parent.click();
    await expect(parent).toHaveClass(/flow-node-selected/);
    await window.keyboard.press('Tab');
    await window.keyboard.press('Escape');
  };

  const connectByHandle = async (fromId: string, toId: string) => {
    const handle = window.getByTestId(`node-${fromId}`).locator('.node-connect-handle');
    const target = await window.getByTestId(`node-${toId}`).boundingBox();
    const from = await handle.boundingBox();
    if (!from || !target) throw new Error('connect points not found');
    await window.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await window.mouse.down({ button: 'right' });
    await window.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await window.mouse.up({ button: 'right' });
  };

  await createChild('n1');
  await createChild('n2');
  await createChild('n3');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);

  const before = new Map<string, { x: number; y: number }>();
  for (const id of ['n1', 'n2', 'n3', 'n4']) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    if (!box) throw new Error(`missing box ${id}`);
    before.set(id, { x: box.x, y: box.y });
  }

  await connectByHandle('n4', 'n2');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(4);

  const cycleEdgeEndpoint = await window.getByTestId('edge-path-e4').evaluate(element => {
    const d = element.getAttribute('d') || '';
    const values = Array.from(d.matchAll(/-?\d+(?:\.\d+)?/g)).map(match => Number(match[0]));
    return { x: values[values.length - 2], y: values[values.length - 1] };
  });
  const cycleEdgePath = await window.getByTestId('edge-path-e4').evaluate(element => {
    const d = element.getAttribute('d') || '';
    const values = Array.from(d.matchAll(/-?\d+(?:\.\d+)?/g)).map(match => Number(match[0]));
    return { d, values };
  });
  expect(cycleEdgePath.d).toContain('L');
  expect(cycleEdgePath.values.length).toBeGreaterThanOrEqual(10);
  expect(cycleEdgePath.values[5]).toBeLessThan(cycleEdgePath.values[1] - 20);
  const targetNodeMetrics = await window.getByTestId('node-n2').evaluate(element => {
    const node = element as HTMLElement;
    return {
      left: Number.parseFloat(node.style.left),
      centerY: Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height) / 2
    };
  });
  expect(Math.abs(cycleEdgeEndpoint.x - targetNodeMetrics.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(cycleEdgeEndpoint.y - targetNodeMetrics.centerY)).toBeLessThanOrEqual(1);

  for (const id of ['n1', 'n2', 'n3', 'n4']) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    const oldBox = before.get(id);
    if (!box || !oldBox) throw new Error(`missing box ${id}`);
    expect(Math.abs(box.x - oldBox.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y - oldBox.y)).toBeLessThanOrEqual(2);
  }

  const beforeRootBackEdge = new Map<string, { x: number; y: number }>();
  for (const id of ['n1', 'n2', 'n3', 'n4']) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    if (!box) throw new Error(`missing box before root back edge ${id}`);
    beforeRootBackEdge.set(id, { x: box.x, y: box.y });
  }

  await connectByHandle('n4', 'n1');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(5);

  const rootBackEdgeEndpoint = await window.getByTestId('edge-path-e5').evaluate(element => {
    const d = element.getAttribute('d') || '';
    const values = Array.from(d.matchAll(/-?\d+(?:\.\d+)?/g)).map(match => Number(match[0]));
    return { x: values[values.length - 2], y: values[values.length - 1] };
  });
  const rootBackEdgePath = await window.getByTestId('edge-path-e5').evaluate(element => {
    const d = element.getAttribute('d') || '';
    const values = Array.from(d.matchAll(/-?\d+(?:\.\d+)?/g)).map(match => Number(match[0]));
    return { d, values };
  });
  expect(rootBackEdgePath.d).toContain('L');
  expect(rootBackEdgePath.values.length).toBeGreaterThanOrEqual(10);
  const rootNodeMetrics = await window.getByTestId('node-n1').evaluate(element => {
    const node = element as HTMLElement;
    return {
      left: Number.parseFloat(node.style.left),
      centerY: Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height) / 2
    };
  });
  expect(Math.abs(rootBackEdgeEndpoint.x - rootNodeMetrics.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(rootBackEdgeEndpoint.y - rootNodeMetrics.centerY)).toBeLessThanOrEqual(1);

  for (const id of ['n1', 'n2', 'n3', 'n4']) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    const oldBox = beforeRootBackEdge.get(id);
    if (!box || !oldBox) throw new Error(`missing box after root back edge ${id}`);
    expect(Math.abs(box.x - oldBox.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y - oldBox.y)).toBeLessThanOrEqual(2);
  }

  await app.close();
});
