import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

type PngVisualStats = {
  width: number;
  height: number;
  changedPixels: number;
};

test('exports PNG with complete non-blank visual content', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const outputDir = join(process.cwd(), 'test-results', 'png-export-quality');
  const outputPath = join(outputDir, 'graph-export.png');
  await mkdir(outputDir, { recursive: true });
  await rm(outputPath, { force: true });

  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      FLOWMAPTOOL_TEST_SAVE_BINARY_PATH: outputPath
    }
  });
  const window = await app.firstWindow();
  await expect(window).toHaveTitle(/Flowmaptool/i);

  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Space');
  const labelInput = window.locator('.node-label-input');
  await labelInput.fill('Root Topic');
  await labelInput.press('Enter');

  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Tab');
  await expect(window.getByTestId('node-n2')).toBeVisible();
  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Space');
  await labelInput.fill('Export Node 2');
  await labelInput.press('Enter');

  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Tab');
  await expect(window.getByTestId('node-n3')).toBeVisible();
  await window.getByTestId('node-n3').click();
  await window.keyboard.press('Space');
  await labelInput.fill('PNG Node 3');
  await labelInput.press('Enter');

  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Tab');
  await expect(window.getByTestId('node-n4')).toBeVisible();

  await app.evaluate(({ BrowserWindow }) => {
    const targetWindow = BrowserWindow.getAllWindows()[0];
    targetWindow.webContents.send('flowmaptool:menuAction', 'file:exportPng');
  });
  await expect.poll(() => existsSync(outputPath), { timeout: 10_000 }).toBeTruthy();

  const pngBytes = await readFile(outputPath);
  expect(pngBytes.byteLength).toBeGreaterThan(4_000);

  const stats = await window.evaluate(async (base64): Promise<PngVisualStats> => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to inspect exported PNG');
    context.drawImage(image, 0, 0);

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];
    let changedPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      const diff =
        Math.abs(data[index] - bgR) +
        Math.abs(data[index + 1] - bgG) +
        Math.abs(data[index + 2] - bgB);
      if (diff > 24) changedPixels++;
    }

    return { width: image.width, height: image.height, changedPixels };
  }, pngBytes.toString('base64'));

  expect(stats.width).toBeGreaterThan(300);
  expect(stats.height).toBeGreaterThan(160);
  expect(stats.changedPixels).toBeGreaterThan(1000);

  await app.close();
});
