import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { PersistedQflowFile } from '../../src/renderer/src/persistence';
import {
  addChild,
  applyTag,
  createDefaultDocFixture,
  launchApp,
  launchAppWithFixture,
  renameNode,
  triggerMenuAction
} from './helpers';

function dateKeyFromToday(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

test('task table filters by tag and assignee', async () => {
  const { app, window } = await launchApp();

  await renameNode(window, 'n1', 'Root Task');
  await addChild(window, 'n1');
  await renameNode(window, 'n2', 'Pending Zoe Task');
  await applyTag(window, 'n2', 'Pending');
  await addChild(window, 'n1');
  await renameNode(window, 'n3', 'Done Amy Task');
  await applyTag(window, 'n3', 'Done');

  await window.getByTestId('task-toggle').click();
  const panel = window.getByTestId('task-panel');
  const pendingRow = panel.locator('tbody tr').filter({ hasText: 'Pending Zoe Task' });
  const doneRow = panel.locator('tbody tr').filter({ hasText: 'Done Amy Task' });
  await pendingRow.locator('input').nth(1).fill('Zoe');
  await pendingRow.locator('input').nth(3).fill(dateKeyFromToday(-1));
  await doneRow.locator('input').nth(1).fill('Amy');
  await doneRow.locator('input').nth(3).fill(dateKeyFromToday(3));

  await window.getByTestId('task-filter-tag').selectOption({ label: 'Pending' });
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Pending Zoe Task');

  await window.getByTestId('task-filter-assignee').selectOption('Zoe');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Pending Zoe Task');

  await window.getByTestId('task-filter-assignee').selectOption('Amy');
  await expect(panel).toContainText('No task table rows match the current filters.');

  await window.getByTestId('task-filter-tag').selectOption('');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Done Amy Task');

  await window.getByTestId('task-filter-assignee').selectOption('');
  await window.getByTestId('task-filter-due').selectOption('overdue');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Pending Zoe Task');

  await window.getByTestId('task-filter-due').selectOption('next7');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Done Amy Task');

  await app.close();
});

test('task table preferences persist after save and reopen', async ({}, testInfo) => {
  const first = await launchAppWithFixture(testInfo, 'task-table-prefs.qflow', createDefaultDocFixture());
  const filePath = first.filePath;

  await triggerMenuAction(first.app, 'file:open');
  await first.window.getByTestId('task-toggle').click();
  await first.window.getByTestId('task-columns-toggle').click();
  await first.window.getByTestId('task-columns-menu').getByLabel('Category').uncheck();
  await first.window.getByTestId('task-filter-tag').selectOption({ label: 'Pending' });
  await first.window.getByTestId('task-filter-due').selectOption('none');
  await first.window.getByTestId('task-density').selectOption('compact');
  await first.window.getByTestId('task-sort-due').click();
  await first.window.getByTestId('task-sort-due').click();
  await first.window.getByTestId('task-expand-toggle').click();
  await expect(first.window.locator('.canvas-workspace')).toHaveClass(/canvas-workspace-task-expanded/);
  await expect(first.window.locator('.task-table')).toHaveClass(/task-table-compact/);

  await triggerMenuAction(first.app, 'file:save');
  await expect(first.window.getByTestId('file-status')).toContainText('Saved');
  await first.app.close();

  const saved = JSON.parse(await readFile(filePath, 'utf-8')) as PersistedQflowFile;
  expect(saved.ui?.taskTable).toEqual({
    sort: { key: 'due', direction: 'desc' },
    filters: { tagId: 'tag-pink', due: 'none' },
    visibleColumnKeys: ['task', 'priority', 'progress', 'assignee', 'start', 'due', 'tag', 'notes'],
    expanded: true,
    density: 'compact'
  });

  const second = await launchAppWithFixture(testInfo, 'task-table-prefs-reopen.qflow', saved);
  await triggerMenuAction(second.app, 'file:open');
  await second.window.getByTestId('task-toggle').click();

  const reopenedPanel = second.window.getByTestId('task-panel');
  await expect(second.window.locator('.canvas-workspace')).toHaveClass(/canvas-workspace-task-expanded/);
  await expect(second.window.getByTestId('task-filter-tag')).toHaveValue('tag-pink');
  await expect(second.window.getByTestId('task-filter-due')).toHaveValue('none');
  await expect(second.window.getByTestId('task-density')).toHaveValue('compact');
  await expect(reopenedPanel.locator('.task-table')).toHaveClass(/task-table-compact/);
  await expect(reopenedPanel.locator('th').filter({ hasText: 'Category' })).toHaveCount(0);
  await expect(second.window.getByTestId('task-sort-due').locator('xpath=ancestor::th')).toHaveAttribute(
    'aria-sort',
    'descending'
  );

  await second.app.close();
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
