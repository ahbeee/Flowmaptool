import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('keyboard and mouse shortcuts for node editing and duplication', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();
  const nodeLocator = window.locator('[data-testid^="node-"]');

  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
  await expect(window.getByTestId('node-n2')).toBeVisible();
  await expect(nodeLocator).toHaveCount(2);

  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Space');
  const labelInput = window.locator('.node-label-input');
  await expect(labelInput).toBeVisible();
  await labelInput.fill('Task A');
  await labelInput.press('Enter');
  await expect(window.getByTestId('node-n2')).toContainText('Task A');

  const widthBeforeChinese = await window.getByTestId('node-n2').boundingBox();
  await window.keyboard.press('Space');
  await expect(labelInput).toBeVisible();
  await labelInput.fill('中文測試中文測試中文測試');
  const widthDuringChinese = await window.getByTestId('node-n2').boundingBox();
  expect(widthDuringChinese?.width).toBeGreaterThan((widthBeforeChinese?.width || 0) + 20);
  await labelInput.press('Enter');
  await expect(window.getByTestId('node-n2')).toContainText('中文測試中文測試中文測試');

  await window.keyboard.press('Control+C');
  await window.keyboard.press('Control+V');
  await expect(nodeLocator).toHaveCount(3);

  await window.keyboard.press('Delete');
  await expect(nodeLocator).toHaveCount(2);

  await app.close();
});
