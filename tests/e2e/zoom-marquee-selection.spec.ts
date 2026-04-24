import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('marquee selection stays aligned after zoom', async () => {
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

  await createChild('n1');
  await createChild('n2');
  await expect(window.locator('[data-testid^="node-"]')).toHaveCount(3);

  await window.keyboard.down('Control');
  await window.mouse.wheel(0, -700);
  await window.keyboard.up('Control');

  const n3 = await window.getByTestId('node-n3').boundingBox();
  if (!n3) throw new Error('node n3 bounding box not found');

  const startX = n3.x - 10;
  const startY = n3.y - 10;
  const endX = n3.x + n3.width + 10;
  const endY = n3.y + n3.height + 10;

  await window.mouse.move(startX, startY);
  await window.mouse.down();
  await window.mouse.move(endX, endY);
  await window.mouse.up();

  await window.keyboard.press('Delete');
  await expect(window.locator('[data-testid^="node-"]')).toHaveCount(2);

  await app.close();
});
