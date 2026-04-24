import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('undo and redo node and edge operations', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();
  const nodeLocator = window.locator('[data-testid^="node-"]');
  const edgeLocator = window.locator('[data-testid^="edge-path-"]');

  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
  await expect(nodeLocator).toHaveCount(3);
  await expect(edgeLocator).toHaveCount(2);

  await window.keyboard.press('Control+Z');
  await expect(nodeLocator).toHaveCount(2);
  await expect(edgeLocator).toHaveCount(1);

  await window.keyboard.press('Control+Z');
  await expect(nodeLocator).toHaveCount(1);
  await expect(edgeLocator).toHaveCount(0);

  await window.keyboard.press('Control+Y');
  await expect(nodeLocator).toHaveCount(2);
  await expect(edgeLocator).toHaveCount(1);

  await window.keyboard.press('Control+Y');
  await expect(nodeLocator).toHaveCount(3);
  await expect(edgeLocator).toHaveCount(2);

  await app.close();
});
