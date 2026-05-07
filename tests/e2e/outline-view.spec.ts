import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDefaultDocFixture, launchApp, launchAppWithFixture, triggerMenuAction } from './helpers';

async function launchWithOpenPath(filePath: string) {
  const { app, window } = await launchApp({ FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: filePath });
  await expect(window.getByTestId('node-n1')).toBeVisible();
  return { app, window };
}

function createChecklistFixture() {
  return createDefaultDocFixture({
    nodes: [
      { id: 'n1', label: 'Root Topic' },
      { id: 'n2', label: 'First task' },
      {
        id: 'n3',
        label: 'Second task',
        style: { tagId: 'tag-pink' },
        task: {
          enabled: true,
          done: false,
          status: 'next',
          priority: 'high',
          progress: 25,
          assignee: 'Avery',
          dueDate: '2026-05-10'
        }
      },
      { id: 'n4', label: 'Reference only' }
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', role: 'layout' },
      { id: 'e2', from: 'n2', to: 'n3', role: 'layout' },
      { id: 'e3', from: 'n1', to: 'n4', role: 'layout' }
    ],
    meta: {
      nextNodeSeq: 5,
      nextEdgeSeq: 4
    },
    settings: {
      spacing: {
        horizontal: 48,
        vertical: 8
      }
    }
  });
}

test('outline mirrors hierarchy and selection', async () => {
  const { app, window } = await launchApp();

  await expect(window.getByTestId('outline-panel')).toBeVisible();
  await expect(window.getByTestId('outline-node-n1')).toBeVisible();

  await window.getByTestId('node-n1').click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
  await window.getByTestId('node-n2').click();
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');

  await expect(window.getByTestId('outline-node-n2')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();

  await expect(window.getByTestId('outline-check-n2')).toHaveCount(0);
  await expect(window.getByTestId('outline-check-n3')).toHaveCount(0);

  await window.getByTestId('outline-toggle-n2').click();
  await expect(window.getByTestId('outline-node-n3')).toHaveCount(0);
  await window.getByTestId('outline-toggle-n2').click();

  await window.getByTestId('outline-node-n2').click();
  await expect(window.getByTestId('node-n2')).toHaveClass(/flow-node-selected/);
  await expect(window.getByTestId('outline-node-n2')).toHaveClass(/outline-node-selected/);

  await window.getByTestId('node-n1').click();
  await expect(window.getByTestId('outline-node-n1')).toHaveClass(/outline-node-selected/);

  await app.close();
});

test('outline search filters matches and expands collapsed parents', async ({}, testInfo) => {
  const { app, window } = await launchAppWithFixture(testInfo, 'outline-search.qflow', createChecklistFixture());

  await triggerMenuAction(app, 'file:open');
  await window.getByTestId('outline-toggle-n2').click();
  await expect(window.getByTestId('outline-node-n3')).toHaveCount(0);

  await window.getByTestId('outline-search').fill('second');
  await expect(window.getByTestId('outline-node-n1')).toBeVisible();
  await expect(window.getByTestId('outline-node-n2')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toHaveClass(/outline-node-match/);
  await expect(window.getByTestId('outline-node-n4')).toHaveCount(0);

  await window.getByTestId('outline-search').fill('pending');
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toHaveClass(/outline-node-match/);

  await window.getByTestId('outline-search').fill('missing');
  await expect(window.getByTestId('outline-search-empty')).toBeVisible();
  await window.getByTestId('outline-clear-search').click();
  await expect(window.getByTestId('outline-node-n1')).toBeVisible();

  await app.close();
});

test('outline can focus checklist branches separately from the full hierarchy', async ({}, testInfo) => {
  const { app, window } = await launchAppWithFixture(
    testInfo,
    'outline-checklist-mode.qflow',
    createChecklistFixture()
  );

  await triggerMenuAction(app, 'file:open');
  await expect(window.getByTestId('outline-mode-outline')).toHaveAttribute('aria-selected', 'true');
  await expect(window.getByTestId('outline-node-n4')).toBeVisible();

  await window.getByTestId('outline-mode-checklist').click();
  await expect(window.getByTestId('outline-mode-checklist')).toHaveAttribute('aria-selected', 'true');
  await expect(window.getByTestId('outline-node-n1')).toBeVisible();
  await expect(window.getByTestId('outline-node-n2')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();
  await expect(window.getByTestId('outline-node-n4')).toHaveCount(0);
  await expect(window.getByTestId('outline-check-n2')).toBeVisible();
  await expect(window.getByTestId('outline-checklist-view-all-count')).toContainText('1');
  await expect(window.getByTestId('outline-checklist-view-open-count')).toContainText('1');
  await expect(window.getByTestId('outline-checklist-view-done-count')).toContainText('0');

  await window.getByTestId('outline-check-n3').check();
  await expect(window.getByTestId('outline-checklist-view-open-count')).toContainText('0');
  await expect(window.getByTestId('outline-checklist-view-done-count')).toContainText('1');
  await window.getByTestId('outline-checklist-view-open').click();
  await expect(window.getByTestId('outline-node-n2')).toHaveCount(0);
  await window.getByTestId('outline-checklist-view-done').click();
  await expect(window.getByTestId('outline-node-n1')).toBeVisible();
  await expect(window.getByTestId('outline-node-n2')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();
  await window.getByTestId('outline-checklist-view-all').click();

  await window.getByTestId('outline-search').fill('second');
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toHaveClass(/outline-node-match/);
  await window.getByTestId('outline-mode-outline').click();
  await expect(window.getByTestId('outline-search')).toHaveValue('second');
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();

  await app.close();
});

test('outline can expand and collapse all visible branches', async ({}, testInfo) => {
  const { app, window } = await launchAppWithFixture(
    testInfo,
    'outline-expand-collapse.qflow',
    createChecklistFixture()
  );

  await triggerMenuAction(app, 'file:open');
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();
  await expect(window.getByTestId('outline-expand-all')).toBeDisabled();

  await window.getByTestId('outline-collapse-all').click();
  await expect(window.getByTestId('outline-node-n2')).toHaveCount(0);
  await expect(window.getByTestId('outline-node-n4')).toHaveCount(0);
  await expect(window.getByTestId('outline-expand-all')).toBeEnabled();

  await window.getByTestId('node-n3').click();
  await expect(window.getByTestId('outline-node-n2')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();
  await expect(window.getByTestId('outline-node-n2')).toHaveClass(/outline-node-ancestor/);
  await expect(window.getByTestId('outline-node-n3')).toHaveClass(/outline-node-selected/);

  await window.getByTestId('outline-expand-all').click();
  await expect(window.getByTestId('outline-node-n2')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();
  await expect(window.getByTestId('outline-node-n4')).toBeVisible();
  await expect(window.getByTestId('outline-expand-all')).toBeDisabled();

  await window.getByTestId('outline-mode-checklist').click();
  await window.getByTestId('outline-collapse-all').click();
  await expect(window.getByTestId('outline-node-n2')).toHaveCount(0);
  await window.getByTestId('outline-expand-all').click();
  await expect(window.getByTestId('outline-node-n2')).toBeVisible();
  await expect(window.getByTestId('outline-node-n3')).toBeVisible();

  await app.close();
});

test('outline supports inline label editing and context metadata updates', async ({}, testInfo) => {
  const { app, window } = await launchAppWithFixture(testInfo, 'outline-inline-edit.qflow', createChecklistFixture());

  await triggerMenuAction(app, 'file:open');
  await window.getByTestId('outline-node-n4').dblclick();
  await expect(window.getByTestId('outline-edit-n4')).toBeVisible();
  await window.getByTestId('outline-edit-n4').fill('Reference backlog');
  await window.keyboard.press('Enter');
  await expect(window.getByTestId('outline-node-n4')).toContainText('Reference backlog');
  await expect(window.getByTestId('node-n4')).toContainText('Reference backlog');

  await window.getByTestId('outline-node-n4').click({ button: 'right' });
  await expect(window.getByTestId('outline-context-menu')).toBeVisible();
  await window.getByTestId('outline-context-tag').selectOption('tag-pink');
  await window.getByTestId('outline-context-status').selectOption('next');
  await expect(window.getByTestId('outline-node-n4')).toContainText('Pending');
  await expect(window.getByTestId('outline-node-n4')).toContainText('Next');
  await expect(window.getByTestId('outline-check-n4')).toBeVisible();

  await app.close();
});

test('outline checklist state persists after save and reopen', async ({}, testInfo) => {
  const first = await launchAppWithFixture(testInfo, 'checklist-persist.qflow', createChecklistFixture());
  const filePath = first.filePath;

  await triggerMenuAction(first.app, 'file:open');
  await expect(first.window.getByTestId('outline-check-n1')).toBeVisible();
  await expect(first.window.getByTestId('outline-check-n2')).toBeVisible();
  await expect(first.window.getByTestId('outline-node-n3')).toContainText('Second task');
  await expect(first.window.getByTestId('outline-node-n3')).toContainText('Pending');
  await expect(first.window.getByTestId('outline-node-n3')).toContainText('Next');
  await expect(first.window.getByTestId('outline-node-n3')).toContainText('High');
  await expect(first.window.getByTestId('outline-node-n3')).toContainText('Avery');
  await expect(first.window.getByTestId('outline-node-n3')).toContainText('Due 2026-05-10');
  await expect(first.window.getByTestId('outline-check-n3')).toBeVisible();
  await expect(first.window.getByTestId('outline-check-n4')).toHaveCount(0);
  await first.window.getByTestId('outline-check-n2').check();
  await expect(first.window.getByTestId('outline-node-n2')).toHaveClass(/outline-node-complete/);
  await expect(first.window.getByTestId('outline-check-n3')).toBeChecked();
  await triggerMenuAction(first.app, 'file:save');
  await expect(first.window.getByTestId('file-status')).toContainText('Saved');
  await first.app.close();

  const saved = JSON.parse(await readFile(filePath, 'utf-8')) as {
    doc: { checklist?: { checkedNodeIds?: string[] } };
  };
  expect(saved.doc.checklist?.checkedNodeIds).toContain('n3');
  expect(saved.doc.checklist?.checkedNodeIds).not.toContain('n2');

  const second = await launchWithOpenPath(filePath);
  await triggerMenuAction(second.app, 'file:open');
  await expect(second.window.getByTestId('outline-check-n2')).toBeChecked();
  await expect(second.window.getByTestId('outline-check-n3')).toBeChecked();
  await expect(second.window.getByTestId('outline-node-n2')).toHaveClass(/outline-node-complete/);
  await second.app.close();
});

test('outline can be hidden and restored', async () => {
  const { app, window } = await launchApp();

  await window.getByTestId('outline-toggle').click();
  await expect(window.getByTestId('outline-panel')).toHaveCount(0);
  await window.getByTestId('outline-toggle').click();
  await expect(window.getByTestId('outline-panel')).toBeVisible();

  await app.close();
});

test('side panel resizer supports keyboard and pointer resizing', async () => {
  const { app, window } = await launchApp();
  const resizer = window.getByTestId('side-panel-resizer');

  await expect(resizer).toHaveAttribute('aria-valuenow', '360');
  await resizer.focus();
  await window.keyboard.press('ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', '376');
  await window.keyboard.press('ArrowLeft');
  await expect(resizer).toHaveAttribute('aria-valuenow', '360');

  const box = await resizer.boundingBox();
  if (!box) throw new Error('side panel resizer not found');
  await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await window.mouse.down();
  await window.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2);
  await window.mouse.up();
  await expect(resizer).toHaveAttribute('aria-valuenow', '440');

  await app.close();
});
