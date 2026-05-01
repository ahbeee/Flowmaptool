import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');

test('outline mirrors hierarchy and selection', async () => {
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  await expect(window.getByTestId('outline-panel')).toBeVisible();
  await expect(window.getByTestId('outline-node-n1')).toBeVisible();

  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');

  await expect(window.getByTestId('outline-node-n2')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();

  await window.getByTestId('outline-toggle-n2').click();
  await expect(window.getByTestId('outline-node-n3')).toHaveCount(0);
  await window.getByTestId('outline-toggle-n2').click();

  await window.getByTestId('outline-node-n2').click();
  await expect(window.getByTestId('node-n2')).toHaveClass(/flow-node-selected/);
  await expect(window.getByTestId('outline-node-n2')).toHaveClass(/outline-node-selected/);

  await window.getByTestId('node-n1').click();
  await expect(window.getByTestId('outline-node-n1')).toHaveClass(/outline-node-selected/);

  await app.close();
});

test('outline can be hidden and restored', async () => {
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  await window.getByTestId('outline-toggle').click();
  await expect(window.getByTestId('outline-panel')).toHaveCount(0);
  await window.getByTestId('outline-toggle').click();
  await expect(window.getByTestId('outline-panel')).toBeVisible();

  await app.close();
});
