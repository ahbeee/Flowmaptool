import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('tag toolbar applies, renames, and deletes node tags', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const root = window.getByTestId('node-n1');
  await root.click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');

  const child = window.getByTestId('node-n2');
  await child.click();
  await expect(window.getByText('Node Style', { exact: true })).toBeVisible();
  const tagSelect = window
    .locator('label.toolbar-field')
    .filter({ has: window.getByText('Tag', { exact: true }) })
    .locator('select');

  await tagSelect.selectOption('tag-pink');
  await expect(child).toHaveAttribute('title', 'Pending');
  await expect(child.locator('.node-tag-marker')).toHaveCSS('background-color', 'rgb(236, 72, 153)');

  await window.getByLabel('Add tag').click();
  await window.locator('.tag-row input:not([type="color"])').last().fill('Blocked');
  await tagSelect.selectOption({ label: 'Blocked' });
  await expect(child).toHaveAttribute('title', 'Blocked');

  await window.getByLabel('Delete tag Blocked').click();
  await expect(child).toHaveAttribute('title', '');
  await expect(child.locator('.node-tag-marker')).toHaveCount(0);

  await app.close();
});
