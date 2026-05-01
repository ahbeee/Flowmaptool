import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

async function createChild(window: Page, parentId: string) {
  await window.getByTestId(`node-${parentId}`).click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
}

async function centerY(window: Page, nodeId: string) {
  const box = await window.getByTestId(`node-${nodeId}`).boundingBox();
  if (!box) throw new Error(`missing node ${nodeId}`);
  return box.y + box.height / 2;
}

async function centerX(window: Page, nodeId: string) {
  const box = await window.getByTestId(`node-${nodeId}`).boundingBox();
  if (!box) throw new Error(`missing node ${nodeId}`);
  return box.x + box.width / 2;
}

test('ctrl arrow up and down reorders siblings without detaching subtree', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  await createChild(window, 'n1');
  await createChild(window, 'n1');
  await createChild(window, 'n1');
  await createChild(window, 'n2');

  await expect(window.getByTestId('node-n5')).toBeVisible();
  expect(await centerY(window, 'n2')).toBeLessThan(await centerY(window, 'n3'));
  expect(await centerY(window, 'n3')).toBeLessThan(await centerY(window, 'n4'));

  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Control+ArrowDown');
  expect(await centerY(window, 'n3')).toBeLessThan(await centerY(window, 'n2'));
  expect(await centerY(window, 'n2')).toBeLessThan(await centerY(window, 'n4'));
  expect(await centerX(window, 'n5')).toBeGreaterThan(await centerX(window, 'n2'));

  await window.keyboard.press('Control+ArrowDown');
  expect(await centerY(window, 'n3')).toBeLessThan(await centerY(window, 'n4'));
  expect(await centerY(window, 'n4')).toBeLessThan(await centerY(window, 'n2'));

  const bottomY = await centerY(window, 'n2');
  await window.keyboard.press('Control+ArrowDown');
  expect(Math.abs((await centerY(window, 'n2')) - bottomY)).toBeLessThan(2);

  await window.keyboard.press('Control+ArrowUp');
  await window.keyboard.press('Control+ArrowUp');
  expect(await centerY(window, 'n2')).toBeLessThan(await centerY(window, 'n3'));
  expect(await centerY(window, 'n3')).toBeLessThan(await centerY(window, 'n4'));

  await app.close();
});
