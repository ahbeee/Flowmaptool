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

  await window.getByLabel('Apply tag Pending').click();
  await expect(child).toHaveAttribute('data-tag-name', 'Pending');
  await expect(child.locator('.node-tag-marker')).toHaveCSS('background-color', 'rgb(236, 72, 153)');

  await window.getByLabel('New tag color', { exact: true }).click();
  await window.getByLabel('New tag color #a855f7').click();
  await window.getByLabel('Add tag').click();
  await window.locator('.tag-row input:not([type="color"])').last().fill('Blocked');
  await window.getByLabel('Apply tag Blocked').click();
  await expect(child).toHaveAttribute('data-tag-name', 'Blocked');
  await expect(child.locator('.node-tag-marker')).toHaveCSS('background-color', 'rgb(168, 85, 247)');

  await window.getByLabel('Delete tag Blocked').click();
  await expect(child).not.toHaveAttribute('data-tag-name', /.+/);
  await expect(child.locator('.node-tag-marker')).toHaveCount(0);

  await app.close();
});
