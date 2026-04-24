import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('right dragging node body does not move nodes or create edges', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const root = window.getByTestId('node-n1');
  await root.click();
  await expect(root).toHaveClass(/flow-node-selected/);
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');

  const child = window.getByTestId('node-n2');
  const edgePaths = window.locator('[data-testid^="edge-path-"]');
  await expect(edgePaths).toHaveCount(1);

  const beforeRoot = await root.boundingBox();
  const beforeChild = await child.boundingBox();
  if (!beforeRoot || !beforeChild) throw new Error('node boxes not found');

  await window.mouse.move(beforeRoot.x + beforeRoot.width / 2, beforeRoot.y + beforeRoot.height / 2);
  await window.mouse.down({ button: 'right' });
  await window.mouse.move(beforeRoot.x + 420, beforeRoot.y + 220);
  await window.mouse.up({ button: 'right' });

  await expect(edgePaths).toHaveCount(1);

  const afterRoot = await root.boundingBox();
  const afterChild = await child.boundingBox();
  if (!afterRoot || !afterChild) throw new Error('node boxes missing after right drag');

  expect(Math.abs(afterRoot.x - beforeRoot.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterRoot.y - beforeRoot.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterChild.x - beforeChild.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterChild.y - beforeChild.y)).toBeLessThanOrEqual(2);

  await app.close();
});
