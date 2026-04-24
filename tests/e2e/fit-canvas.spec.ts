import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('fit zooms and scrolls canvas to visible graph bounds', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const root = window.getByTestId('node-n1');
  for (let index = 0; index < 12; index += 1) {
    await root.click();
    await window.keyboard.press('Tab');
    await window.keyboard.press('Escape');
  }
  await expect(window.locator('[data-testid^="node-"]')).toHaveCount(13);

  await window.keyboard.down('Control');
  await window.mouse.wheel(0, -2400);
  await window.keyboard.up('Control');

  await expect
    .poll(async () =>
      window
        .getByTestId('canvas-surface')
        .evaluate(element => Number((element as HTMLElement).style.zoom) || 1)
    )
    .toBeGreaterThan(1);

  await window.keyboard.press('Control+0');

  await expect
    .poll(async () =>
      window
        .getByTestId('canvas-surface')
        .evaluate(element => Number((element as HTMLElement).style.zoom) || 1)
    )
    .toBeLessThanOrEqual(1.25);

  const viewport = await window.getByTestId('canvas-viewport').boundingBox();
  const rootBox = await window.getByTestId('node-n1').boundingBox();
  const lastBox = await window.getByTestId('node-n13').boundingBox();
  if (!viewport || !rootBox || !lastBox) throw new Error('expected fit bounding boxes');

  expect(rootBox.x).toBeGreaterThanOrEqual(viewport.x - 2);
  expect(rootBox.y).toBeGreaterThanOrEqual(viewport.y - 2);
  expect(lastBox.x + lastBox.width).toBeLessThanOrEqual(viewport.x + viewport.width + 2);
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(viewport.y + viewport.height + 2);

  await app.close();
});
