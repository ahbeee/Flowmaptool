import { _electron as electron, expect, type Locator, test } from '@playwright/test';
import { join } from 'node:path';

async function setColor(locator: Locator, value: string) {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('node style toolbar applies visual changes to selected nodes', async () => {
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

  const before = await child.boundingBox();
  await window.getByLabel('Size').selectOption('48');
  await expect(child).toHaveCSS('font-size', '48px');
  const after = await child.boundingBox();
  expect(after?.height || 0).toBeGreaterThan((before?.height || 0) + 20);

  await window.getByLabel('Shape').selectOption('pill');
  const radius = await child.evaluate(element => parseFloat(getComputedStyle(element).borderTopLeftRadius));
  expect(radius).toBeGreaterThan(20);

  await setColor(window.getByLabel('Node Color'), '#ff8800');
  await expect(child).toHaveCSS('background-color', 'rgb(255, 136, 0)');

  await app.close();
});

test('map style toolbar applies theme and default shape to new nodes', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  await expect(window.getByText('Mind Map Style')).toBeVisible();
  await window.getByLabel('Theme').selectOption('gray-red');
  await window.getByLabel('Default Shape').selectOption('pill');

  const root = window.getByTestId('node-n1');
  await expect(root).toHaveCSS('background-color', 'rgb(16, 32, 39)');
  await root.click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');

  const child = window.getByTestId('node-n2');
  await expect(child).toBeVisible();
  const radius = await child.evaluate(element => parseFloat(getComputedStyle(element).borderTopLeftRadius));
  expect(radius).toBeGreaterThan(10);

  await app.close();
});
