import { _electron as electron, expect, type Page, test } from '@playwright/test';
import { join } from 'node:path';

function toolbarSelect(window: Page, label: string) {
  return window
    .locator('label.toolbar-field')
    .filter({ has: window.getByText(label, { exact: true }) })
    .locator('select');
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

  await window.getByLabel('Node Color #f97316').click();
  await expect(child).toHaveCSS('background-color', 'rgb(249, 115, 22)');

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

test('line style toolbar applies default and selected edge changes', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  await expect(window.getByText('Mind Map Style')).toBeVisible();
  await toolbarSelect(window, 'Line Width').selectOption('4');
  await toolbarSelect(window, 'Line Type').selectOption('dashed');
  await window.getByLabel('Line Color #ef4444').click();

  const root = window.getByTestId('node-n1');
  await root.click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');

  const edge = window.getByTestId('edge-path-e1');
  await expect(edge).toHaveCount(1);
  await expect(edge).toHaveCSS('stroke', 'rgb(239, 68, 68)');
  await expect(edge).toHaveCSS('stroke-width', '4px');
  await expect(edge).toHaveCSS('stroke-dasharray', '16px, 12px');

  await edge.click({ force: true });
  await expect(window.getByText('Line Style', { exact: true })).toBeVisible();
  await toolbarSelect(window, 'Line Width').selectOption('2');
  await toolbarSelect(window, 'Line Type').selectOption('dotted');
  await window.getByLabel('Line Color #0ea5e9').click();

  await expect(edge).toHaveCSS('stroke', 'rgb(14, 165, 233)');
  await expect(edge).toHaveCSS('stroke-dasharray', '1px, 6px');

  await app.close();
});
