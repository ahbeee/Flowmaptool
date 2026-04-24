import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

test('app starts after build', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  expect(existsSync(mainEntry)).toBeTruthy();

  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();
  await expect(window).toHaveTitle(/Flowmaptool/i);
  await app.close();
});
