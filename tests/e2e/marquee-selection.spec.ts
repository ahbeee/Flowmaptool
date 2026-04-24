import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('marquee select nodes then delete', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();
  const nodeLocator = window.locator('[data-testid^="node-"]');
  const createChild = async (parentId: string) => {
    const parent = window.getByTestId(`node-${parentId}`);
    await parent.click();
    await expect(parent).toHaveClass(/flow-node-selected/);
    await window.keyboard.press('Tab');
    await window.keyboard.press('Escape');
  };

  await createChild('n1');
  await createChild('n2');
  await expect(nodeLocator).toHaveCount(3);

  const n1 = await window.getByTestId('node-n1').boundingBox();
  const n2 = await window.getByTestId('node-n2').boundingBox();
  if (!n1 || !n2) {
    throw new Error('node bounding boxes not found');
  }

  const startX = Math.min(n1.x, n2.x) - 12;
  const startY = Math.min(n1.y, n2.y) - 12;
  const endX = Math.max(n1.x + n1.width, n2.x + n2.width) + 12;
  const endY = Math.max(n1.y + n1.height, n2.y + n2.height) + 12;

  await window.mouse.move(startX, startY);
  await window.mouse.down();
  await window.mouse.move(endX, endY);
  await window.mouse.up();

  await window.keyboard.press('Delete');
  await expect(nodeLocator).toHaveCount(1);

  await app.close();
});
