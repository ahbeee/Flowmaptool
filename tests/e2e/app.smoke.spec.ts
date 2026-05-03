import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { launchApp, mainEntry } from './helpers';

test('app starts after build', async () => {
  expect(existsSync(mainEntry)).toBeTruthy();

  const { app, window } = await launchApp();
  await expect(window).toHaveTitle(/Flowmaptool/i);
  await app.close();
});
