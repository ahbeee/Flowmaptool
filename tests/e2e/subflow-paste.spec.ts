import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('tab add, switch and close keeps documents isolated', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  await expect(window.getByTestId('node-n1')).toBeVisible();
  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Space');
  await window.locator('.node-label-input').fill('First Tab Root');
  await window.keyboard.press('Enter');
  await expect(window.getByTestId('node-n1')).toContainText('First Tab Root');

  await window.getByRole('button', { name: '+' }).click();
  await expect(window.getByTestId('node-n1')).toBeVisible();
  await expect(window.getByTestId('node-n1').locator('div').first()).toHaveText('');

  await window.getByRole('button', { name: 'Untitled 1' }).click();
  await expect(window.getByTestId('node-n1')).toContainText('First Tab Root');

  await window.getByRole('button', { name: 'x' }).first().click();
  await expect(window.getByRole('button', { name: 'Untitled 2' })).toBeVisible();

  await app.close();
});
