import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('new documents and nodes use configured defaults', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const root = window.getByTestId('node-n1');
  await expect(root).toBeVisible();
  await expect(root).toHaveCSS('font-size', '12px');
  await expect(root).toHaveCSS('border-radius', '8px');

  await window.getByLabel('Default Shape').selectOption('rounded');
  await root.click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');

  const child = window.getByTestId('node-n2');
  await expect(child).toBeVisible();
  await expect(child).toHaveCSS('font-size', '12px');
  await expect(child).toHaveCSS('border-radius', '8px');
  const borderTopWidth = await child.evaluate(element => parseFloat(getComputedStyle(element).borderTopWidth));
  const borderBottomWidth = await child.evaluate(element => parseFloat(getComputedStyle(element).borderBottomWidth));
  expect(borderTopWidth).toBeGreaterThan(0);
  expect(borderBottomWidth).toBeGreaterThan(0);

  const childLabel = await child.locator('div').first().textContent();
  expect(childLabel).toBe('');

  await app.close();
});
