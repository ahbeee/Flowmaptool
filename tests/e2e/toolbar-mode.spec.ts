import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('right toolbar toggles visibility and switches by node selection', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  await expect(window.getByText('Mind Map Style')).toBeVisible();
  await expect(window.getByLabel('Theme')).toBeVisible();

  await window.getByTestId('node-n1').click();
  await expect(window.getByText('Node Style', { exact: true })).toBeVisible();
  await expect(window.getByLabel('Font')).toBeVisible();
  await expect(window.getByLabel('Shape')).toBeVisible();

  await window.getByTitle('Hide toolbar').click();
  await expect(window.locator('.right-toolbar-rail')).toHaveCount(0);

  await window.getByTitle('Show toolbar').click();
  await expect(window.getByText('Node Style', { exact: true })).toBeVisible();

  await window.getByTestId('canvas-surface').click({ position: { x: 12, y: 12 } });
  await expect(window.getByText('Mind Map Style')).toBeVisible();
  await expect(window.getByLabel('Layout')).toBeVisible();

  await app.close();
});
