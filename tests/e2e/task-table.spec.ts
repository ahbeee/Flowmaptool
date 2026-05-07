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

async function resizeTaskColumn(window: Awaited<ReturnType<typeof launchApp>>['window'], key: string, deltaX: number) {
  const handle = window.getByTestId(`task-resize-${key}`);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`Missing resize handle for ${key}`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await window.mouse.move(startX, startY);
  await window.mouse.down();
  await window.mouse.move(startX + deltaX, startY);
  await window.mouse.up();
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
  await expect(childRow.locator('select')).toHaveCount(2);

  await childRow.locator('select').nth(1).selectOption('high');
  await expect(childRow.locator('select').nth(1)).toHaveValue('high');
  await childRow.locator('input').nth(2).fill('Amy');
  await childRow.locator('input').nth(5).fill('Follow up');
  await expect(childRow).toContainText('Pending');

  await app.close();
});

test('task workbench captures inbox tasks and promotes next tasks into today', async () => {
  const { app, window } = await launchApp();

  await renameNode(window, 'n1', 'Root Task');
  await window.getByTestId('task-toggle').click();

  await window.getByTestId('task-quick-capture-input').fill('Review inbox');
  await window.getByTestId('task-quick-capture-submit').click();
  await expect(window.getByTestId('task-view-backlog')).toHaveAttribute('aria-selected', 'true');

  const panel = window.getByTestId('task-panel');
  const capturedRow = panel.locator('tbody tr').filter({ hasText: 'Review inbox' });
  await expect(capturedRow).toHaveCount(1);
  await expect(capturedRow.locator('select').first()).toHaveValue('inbox');
  await expect(panel.locator('.task-detail-panel')).toContainText('Review inbox');

  await capturedRow.locator('select').first().selectOption('next');
  await window.getByTestId('task-view-today').click();
  await expect(panel.locator('tbody tr').filter({ hasText: 'Review inbox' })).toHaveCount(1);

  await app.close();
});

test('task workbench bulk updates selected visible tasks', async () => {
  const { app, window } = await launchApp();

  await renameNode(window, 'n1', 'Root Task');
  await addChild(window, 'n1');
  await renameNode(window, 'n2', 'Review contract');
  await applyTag(window, 'n2', 'Pending');
  await addChild(window, 'n1');
  await renameNode(window, 'n3', 'Prepare invoice');
  await applyTag(window, 'n3', 'Pending');

  await window.getByTestId('task-toggle').click();
  const panel = window.getByTestId('task-panel');
  await expect(panel.locator('tbody tr')).toHaveCount(2);
  await expect(window.getByTestId('task-bulk-count')).toContainText('2 visible');

  await window.getByTestId('task-filter-query').fill('contract');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await window.getByTestId('task-select-visible').click();
  await expect(window.getByTestId('task-select-n2')).toBeChecked();
  await expect(window.getByTestId('task-bulk-count')).toContainText('1 selected');

  await window.getByTestId('task-bulk-status').selectOption('done');
  await expect(window.getByTestId('task-row-n2')).toHaveClass(/task-row-status-done/);
  await expect(window.getByTestId('task-row-n2').locator('select').first()).toHaveValue('done');
  await window.getByTestId('task-bulk-assignee').fill('Kai');
  await window.getByTestId('task-apply-assignee').click();
  await window.getByTestId('task-bulk-due').fill(dateKeyFromToday(2));
  await window.getByTestId('task-apply-due').click();
  await expect(window.getByTestId('task-row-n2').locator('input').nth(2)).toHaveValue('Kai');
  await expect(window.getByTestId('task-row-n2').locator('input').nth(4)).toHaveValue(dateKeyFromToday(2));
  await window.getByTestId('task-bulk-due-tomorrow').click();
  await expect(window.getByTestId('task-row-n2').locator('input').nth(4)).toHaveValue(dateKeyFromToday(1));
  await window.getByTestId('task-bulk-due-none').click();
  await expect(window.getByTestId('task-row-n2').locator('input').nth(4)).toHaveValue('');

  await window.getByTestId('task-filter-query').fill('');
  await expect(window.getByTestId('task-row-n3').locator('input').nth(2)).toHaveValue('');
  await expect(window.getByTestId('task-row-n3').locator('input').nth(4)).toHaveValue('');
  await window.getByTestId('task-filter-assignee').selectOption('Kai');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Review contract');
  await window.getByTestId('task-filter-assignee').selectOption('');
  await window.getByTestId('task-row-n2').locator('.task-node-link').click();
  await window.getByTestId('task-detail-due-today').click();
  await expect(window.getByTestId('task-row-n2').locator('input').nth(4)).toHaveValue(dateKeyFromToday(0));
  await window.getByTestId('task-view-done').click();
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Review contract');

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
  await pendingRow.locator('input').nth(2).fill('Zoe');
  await pendingRow.locator('input').nth(4).fill(dateKeyFromToday(-1));
  await doneRow.locator('input').nth(2).fill('Amy');
  await doneRow.locator('input').nth(4).fill(dateKeyFromToday(3));
  await expect(pendingRow.locator('td.task-due-cell-overdue')).toHaveCount(1);
  await expect(pendingRow.locator('input').nth(4)).toHaveAttribute('title', 'Overdue');

  await window.getByTestId('task-filter-tag').selectOption({ label: 'Pending' });
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Pending Zoe Task');

  await window.getByTestId('task-filter-query').fill('zoe');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Pending Zoe Task');

  await window.getByTestId('task-filter-query').fill('missing');
  await expect(panel).toContainText('No task table rows match the current filters.');
  await window.getByTestId('task-filter-query').fill('');

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

  await window.getByTestId('task-sort-task').click();
  await expect(window.getByTestId('task-sort-task').locator('xpath=ancestor::th')).toHaveAttribute(
    'aria-sort',
    'ascending'
  );
  await window.getByTestId('task-clear-query').click();
  await expect(window.getByTestId('task-filter-tag')).toHaveValue('');
  await expect(window.getByTestId('task-filter-query')).toHaveValue('');
  await expect(window.getByTestId('task-filter-assignee')).toHaveValue('');
  await expect(window.getByTestId('task-filter-due')).toHaveValue('');
  await expect(window.getByTestId('task-sort-task').locator('xpath=ancestor::th')).toHaveAttribute('aria-sort', 'none');
  await expect(panel.locator('tbody tr')).toHaveCount(2);

  await app.close();
});

test('task table preferences persist after save and reopen', async ({}, testInfo) => {
  const first = await launchAppWithFixture(testInfo, 'task-table-prefs.qflow', createDefaultDocFixture());
  const filePath = first.filePath;

  await triggerMenuAction(first.app, 'file:open');
  await expect(first.window.getByTestId('file-status')).toContainText('Opened');
  await first.window.getByTestId('task-toggle').click();
  await first.window.getByTestId('task-columns-toggle').click();
  await first.window.getByTestId('task-columns-menu').getByLabel('Category').uncheck();
  await first.window.getByTestId('task-filter-tag').selectOption({ label: 'Pending' });
  await first.window.getByTestId('task-filter-query').fill('Root');
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
    filters: { query: 'Root', tagId: 'tag-pink', due: 'none' },
    visibleColumnKeys: ['task', 'status', 'priority', 'progress', 'assignee', 'start', 'due', 'tag', 'notes'],
    columnWidths: {},
    expanded: true,
    density: 'compact',
    view: 'all'
  });

  const second = await launchAppWithFixture(testInfo, 'task-table-prefs-reopen.qflow', saved);
  await triggerMenuAction(second.app, 'file:open');
  await second.window.getByTestId('task-toggle').click();

  const reopenedPanel = second.window.getByTestId('task-panel');
  await expect(second.window.locator('.canvas-workspace')).toHaveClass(/canvas-workspace-task-expanded/);
  await expect(second.window.getByTestId('task-filter-tag')).toHaveValue('tag-pink');
  await expect(second.window.getByTestId('task-filter-query')).toHaveValue('Root');
  await expect(second.window.getByTestId('task-filter-due')).toHaveValue('none');
  await expect(second.window.getByTestId('task-density')).toHaveValue('compact');
  await expect(second.window.getByTestId('task-view-all')).toHaveAttribute('aria-selected', 'true');
  await expect(reopenedPanel.locator('.task-table')).toHaveClass(/task-table-compact/);
  await expect(reopenedPanel.locator('th').filter({ hasText: 'Category' })).toHaveCount(0);
  await expect(second.window.getByTestId('task-sort-due').locator('xpath=ancestor::th')).toHaveAttribute(
    'aria-sort',
    'descending'
  );

  await second.app.close();
});

test('task table columns can be resized and persist after reopen', async ({}, testInfo) => {
  const first = await launchAppWithFixture(testInfo, 'task-table-column-widths.qflow', createDefaultDocFixture());
  const filePath = first.filePath;

  await triggerMenuAction(first.app, 'file:open');
  await expect(first.window.getByTestId('file-status')).toContainText('Opened');
  await first.window.getByTestId('task-toggle').click();
  const taskHeader = first.window.getByTestId('task-sort-task').locator('xpath=ancestor::th');
  const categoryHeader = first.window.getByTestId('task-sort-category').locator('xpath=ancestor::th');
  const initialTaskWidth = Math.round((await taskHeader.boundingBox())?.width ?? 0);
  const initialCategoryWidth = Math.round((await categoryHeader.boundingBox())?.width ?? 0);
  expect(initialTaskWidth).toBeGreaterThan(0);
  expect(initialCategoryWidth).toBeGreaterThan(0);

  await resizeTaskColumn(first.window, 'task', 48);
  await expect
    .poll(() => first.window.locator('col.task-col-task').evaluate(col => (col as HTMLTableColElement).style.width))
    .toBe(`${initialTaskWidth + 48}px`);
  await expect
    .poll(() => first.window.locator('col.task-col-category').evaluate(col => (col as HTMLTableColElement).style.width))
    .toBe(`${initialCategoryWidth}px`);

  await triggerMenuAction(first.app, 'file:save');
  await expect(first.window.getByTestId('file-status')).toContainText('Saved');
  await first.app.close();

  const saved = JSON.parse(await readFile(filePath, 'utf-8')) as PersistedQflowFile;
  expect(saved.ui?.taskTable?.columnWidths.task).toBe(initialTaskWidth + 48);
  expect(saved.ui?.taskTable?.columnWidths.category).toBe(initialCategoryWidth);

  const second = await launchAppWithFixture(testInfo, 'task-table-column-widths-reopen.qflow', saved);
  await triggerMenuAction(second.app, 'file:open');
  await expect(second.window.getByTestId('file-status')).toContainText('Opened');
  await second.window.getByTestId('task-toggle').click();
  await expect
    .poll(() => second.window.locator('col.task-col-task').evaluate(col => (col as HTMLTableColElement).style.width))
    .toBe(`${initialTaskWidth + 48}px`);

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
