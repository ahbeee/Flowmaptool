import { expect, test } from '@playwright/test';
import { addChild, applyTag, launchApp, renameNode } from './helpers';

test('task table derives tagged nodes only and keeps tag read-only', async () => {
  const { app, window } = await launchApp();

  await renameNode(window, 'n1', 'Root Task');

  await addChild(window, 'n1');

  await renameNode(window, 'n2', 'Child Task');
  await applyTag(window, 'n2', 'Pending');

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

test('task table headers sort tagged outline rows', async () => {
  const { app, window } = await launchApp();

  await renameNode(window, 'n1', 'Root Task');

  await addChild(window, 'n1');
  await renameNode(window, 'n2', 'Bravo Task');
  await applyTag(window, 'n2', 'Pending');

  await addChild(window, 'n1');
  await renameNode(window, 'n3', 'Alpha Task');
  await applyTag(window, 'n3', 'Pending');

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

test('task table column menu hides optional columns and keeps task visible', async () => {
  const { app, window } = await launchApp();

  await renameNode(window, 'n1', 'Root Task');
  await addChild(window, 'n1');
  await renameNode(window, 'n2', 'Child Task');
  await applyTag(window, 'n2', 'Pending');

  await window.getByTestId('task-toggle').click();
  const panel = window.getByTestId('task-panel');
  const columnsMenu = window.getByTestId('task-columns-menu');

  await window.getByTestId('task-columns-toggle').click();
  await expect(columnsMenu.getByLabel('Task')).toBeDisabled();
  await expect(panel.locator('th').filter({ hasText: 'Category' })).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Root Task');

  await columnsMenu.getByLabel('Category').uncheck();
  await expect(panel.locator('th').filter({ hasText: 'Category' })).toHaveCount(0);
  await expect(panel.locator('tbody tr').first()).not.toContainText('Root Task');
  await expect(panel.locator('tbody tr').first().locator('td').first()).toContainText('Child Task');

  await columnsMenu.getByLabel('Category').check();
  await expect(panel.locator('th').filter({ hasText: 'Category' })).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Root Task');

  await app.close();
});

test('task table can expand to the main workspace without horizontal table scrolling', async () => {
  const { app, window } = await launchApp();

  await renameNode(window, 'n1', 'Root Task');

  await addChild(window, 'n1');

  await renameNode(window, 'n2', 'Very long child task title that wraps in expanded table');
  await applyTag(window, 'n2', 'Pending');

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
