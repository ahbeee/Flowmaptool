import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('arrow keys do not move nodes in fixed-spacing mode', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const node = window.getByTestId('node-n1');
  const before = await node.boundingBox();
  if (!before) throw new Error('node-n1 not found');

  await node.click();
  await window.keyboard.press('ArrowDown');
  await window.keyboard.press('ArrowRight');

  const afterKeys = await node.boundingBox();
  if (!afterKeys) throw new Error('node-n1 moved box missing');
  expect(Math.abs(afterKeys.x - before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterKeys.y - before.y)).toBeLessThanOrEqual(2);

  await app.close();
});
