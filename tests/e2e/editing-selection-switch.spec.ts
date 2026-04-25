import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('editing node commits and switches selection on canvas, node, and edge clicks', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();
  const labelInput = window.locator('.node-label-input');

  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
  await expect(window.getByTestId('node-n2')).toBeVisible();

  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Space');
  await expect(labelInput).toBeVisible();
  await labelInput.fill('Canvas commit');
  await window.getByTestId('canvas-surface').click({ position: { x: 8, y: 8 } });
  await expect(labelInput).toHaveCount(0);
  await expect(window.getByTestId('node-n2')).toContainText('Canvas commit');
  await expect(window.locator('.flow-node-selected')).toHaveCount(0);
  await expect(window.locator('.edge-path-selected')).toHaveCount(0);

  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Space');
  await expect(labelInput).toBeVisible();
  await labelInput.fill('Node switch');
  await window.getByTestId('node-n1').click();
  await expect(labelInput).toHaveCount(0);
  await expect(window.getByTestId('node-n2')).toContainText('Node switch');
  await expect(window.getByTestId('node-n1')).toHaveClass(/flow-node-selected/);
  await expect(window.locator('.edge-path-selected')).toHaveCount(0);

  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Space');
  await expect(labelInput).toBeVisible();
  await labelInput.fill('Edge switch');
  await window.getByTestId('edge-path-e1').click({ force: true });
  await expect(labelInput).toHaveCount(0);
  await expect(window.getByTestId('node-n2')).toContainText('Edge switch');
  await expect(window.getByTestId('edge-path-e1')).toHaveClass(/edge-path-selected/);
  await expect(window.locator('.flow-node-selected')).toHaveCount(0);

  await app.close();
});
