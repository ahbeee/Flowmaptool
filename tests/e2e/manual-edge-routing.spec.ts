import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('manual back edge routes around nodes without reflowing layout', async () => {
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
  await createChild('n1');
  await createChild('n2');
  await createChild('n2');
  await createChild('n3');
  await createChild('n3');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(6);

  const before = new Map<string, { x: number; y: number }>();
  for (const id of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    if (!box) throw new Error(`missing node ${id}`);
    before.set(id, { x: box.x, y: box.y });
  }

  await connectByHandle('n7', 'n2');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(7);

  for (const id of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    const oldBox = before.get(id);
    if (!box || !oldBox) throw new Error(`missing node after route ${id}`);
    expect(Math.abs(box.x - oldBox.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y - oldBox.y)).toBeLessThanOrEqual(2);
  }

  const intersectsNonEndpointNode = await window.getByTestId('edge-path-e7').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const boxes = Array.from(document.querySelectorAll('[data-testid^="node-"]'))
      .filter(element => element.getAttribute('data-testid') !== 'node-n7' && element.getAttribute('data-testid') !== 'node-n2')
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left + 6,
          right: rect.right - 6,
          top: rect.top + 6,
          bottom: rect.bottom - 6
        };
      });
    const totalLength = path.getTotalLength();
    for (let distance = totalLength * 0.08; distance <= totalLength * 0.92; distance += 12) {
      const point = path.getPointAtLength(distance).matrixTransform(matrix);
      if (boxes.some(box => point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom)) {
        return true;
      }
    }
    return false;
  });
  expect(intersectsNonEndpointNode).toBe(false);

  await app.close();
});
