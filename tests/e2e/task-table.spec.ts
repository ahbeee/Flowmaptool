import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('task table derives tagged nodes only and keeps tag read-only', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const root = window.getByTestId('node-n1');
  await root.click();
  await window.keyboard.press('Space');
  const labelInput = window.locator('.node-label-input');
  await labelInput.fill('Root Task');
  await labelInput.press('Enter');

  await root.click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');

  const child = window.getByTestId('node-n2');
  await child.click();
  await window.keyboard.press('Space');
  await labelInput.fill('Child Task');
  await labelInput.press('Enter');
  await child.click();
  await window.getByLabel('Apply tag Pending').click();

  await window.getByTestId('task-toggle').click();
  const panel = window.getByTestId('task-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr td:first-child')).not.toContainText('Root Task');

  const childRow = panel.locator('tbody tr').filter({ hasText: 'Child Task' });
  await expect(childRow).toContainText('Root Task');
  await expect(childRow).toContainText('Pending');
  await expect(childRow.locator('select')).toHaveCount(1);

  await childRow.locator('select').selectOption('high');
  await expect(childRow.locator('select')).toHaveValue('high');
  await childRow.locator('input').nth(1).fill('Amy');
  await childRow.locator('input').nth(4).fill('Follow up');
  await expect(childRow).toContainText('Pending');

  await app.close();
});
