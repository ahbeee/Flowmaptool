import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('edge bend is persisted independently for H and V layouts', async () => {
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

  const selectEdge = async (edgeId: string) => {
    await window.getByTestId(`edge-path-${edgeId}`).evaluate(element => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  };

  const bendHandleCenter = async () => {
    const box = await window.locator('.edge-bend-handle').boundingBox();
    if (!box) throw new Error('edge bend handle not found');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const dragBendBy = async (dx: number, dy: number) => {
    const center = await bendHandleCenter();
    await window.mouse.move(center.x, center.y);
    await window.mouse.down();
    await window.mouse.move(center.x + dx, center.y + dy);
    await window.mouse.up();
  };

  await createChild('n1');
  await createChild('n1');

  await selectEdge('e2');
  await dragBendBy(0, 70);
  const hBend = await bendHandleCenter();

  await window.getByLabel('Layout').selectOption('vertical');
  await selectEdge('e2');
  await dragBendBy(70, 0);
  const vBend = await bendHandleCenter();

  await window.getByLabel('Layout').selectOption('horizontal');
  await selectEdge('e2');
  const hAfter = await bendHandleCenter();
  expect(Math.abs(hAfter.y - hBend.y)).toBeLessThanOrEqual(4);

  await window.getByLabel('Layout').selectOption('vertical');
  await selectEdge('e2');
  const vAfter = await bendHandleCenter();
  expect(Math.abs(vAfter.x - vBend.x)).toBeLessThanOrEqual(4);

  await app.close();
});
