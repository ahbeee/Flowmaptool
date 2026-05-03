import { expect, test } from '@playwright/test';
import { addChildNode, launchApp, renameSelectedNode } from './helpers';

test('task table derives tagged nodes only and keeps tag read-only', async () => {
  const { app, window } = await launchApp();

  const root = window.getByTestId('node-n1');
  await root.click();
  await renameSelectedNode(window, 'Root Task');

  await root.click();
  await addChildNode(window);

  const child = window.getByTestId('node-n2');
  await child.click();
  await renameSelectedNode(window, 'Child Task');
  await child.click();
  await window.getByLabel('Apply tag Pending').click();

  await window.getByTestId('task-toggle').click();
  const panel = window.getByTestId('task-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr td:first-child')).not.toContainText('Root Task');

  const childRow = panel.locator('tbody tr').filter({ hasText: 'Child Task' });
  await expect(childRow).toContainText('Root Task');
  await expect(childRow).toContainText('Pending');
  await expect(childRow.locator('select')).toHaveCount(1);

  await childRow.locator('select').selectOption('high');
  await expect(childRow.locator('select')).toHaveValue('high');
  await childRow.locator('input').nth(1).fill('Amy');
  await childRow.locator('input').nth(4).fill('Follow up');
  await expect(childRow).toContainText('Pending');

  await app.close();
});

test('task table headers sort imported checklist rows', async () => {
  const { app, window } = await launchApp();

  const root = window.getByTestId('node-n1');
  await root.click();
  await renameSelectedNode(window, 'Root Task');

  await root.click();
  await addChildNode(window);
  const secondTask = window.getByTestId('node-n2');
  await secondTask.click();
  await renameSelectedNode(window, 'Bravo Task');
  await secondTask.click();
  await window.getByLabel('Apply tag Pending').click();

  await root.click();
  await addChildNode(window);
  const firstTask = window.getByTestId('node-n3');
  await firstTask.click();
  await renameSelectedNode(window, 'Alpha Task');
  await firstTask.click();
  await window.getByLabel('Apply tag Pending').click();

  await window.getByTestId('task-toggle').click();
  const panel = window.getByTestId('task-panel');
  const firstRowTask = panel.locator('tbody tr').first().locator('td').first();

  await expect(panel.locator('tbody tr')).toHaveCount(2);
  await expect(firstRowTask).toContainText('Bravo Task');

  await window.getByTestId('task-sort-task').click();
  await expect(firstRowTask).toContainText('Alpha Task');
  await expect(panel.locator('th').first()).toHaveAttribute('aria-sort', 'ascending');

  await window.getByTestId('task-sort-task').click();
  await expect(firstRowTask).toContainText('Bravo Task');
  await expect(panel.locator('th').first()).toHaveAttribute('aria-sort', 'descending');

  await app.close();
});

test('task table can expand to the main workspace without horizontal table scrolling', async () => {
  const { app, window } = await launchApp();

  const root = window.getByTestId('node-n1');
  await root.click();
  await renameSelectedNode(window, 'Root Task');

  await root.click();
  await addChildNode(window);

  const child = window.getByTestId('node-n2');
  await child.click();
  await renameSelectedNode(window, 'Very long child task title that wraps in expanded table');
  await child.click();
  await window.getByLabel('Apply tag Pending').click();

  await window.getByTestId('task-toggle').click();
  await window.getByTestId('task-expand-toggle').click();

  await expect(window.locator('.canvas-workspace')).toHaveClass(/canvas-workspace-task-expanded/);
  await expect(window.locator('.canvas-main')).toBeHidden();

  const tableBox = await window.getByTestId('task-panel').locator('.task-table').boundingBox();
  const scrollBox = await window.getByTestId('task-panel').locator('.task-table-scroll').boundingBox();
  expect(tableBox?.width ?? 0).toBeLessThanOrEqual((scrollBox?.width ?? 0) + 8);

  const overflowX = await window
    .getByTestId('task-panel')
    .locator('.task-table-scroll')
    .evaluate(el => globalThis.getComputedStyle(el).overflowX);
  expect(overflowX).toBe('hidden');

  await window.getByTestId('task-expand-toggle').click();
  await expect(window.locator('.canvas-main')).toBeVisible();

  await app.close();
});
