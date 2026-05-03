import { expect, test, type ElectronApplication } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { launchApp, writeFixture } from './helpers';

async function triggerMenuAction(app: ElectronApplication, action: 'file:open' | 'file:save') {
  await app.evaluate(({ BrowserWindow }, menuAction) => {
    const targetWindow = BrowserWindow.getAllWindows()[0];
    targetWindow.webContents.send('flowmaptool:menuAction', menuAction);
  }, action);
}

async function launchWithOpenPath(filePath: string) {
  const { app, window } = await launchApp({ FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: filePath });
  await expect(window.getByTestId('node-n1')).toBeVisible();
  return { app, window };
}

function createChecklistFixture() {
  return {
    schemaVersion: 1,
    doc: {
      schemaVersion: 1,
      nodes: [
        { id: 'n1', label: 'Root Topic' },
        { id: 'n2', label: 'First task' },
        { id: 'n3', label: 'Second task', style: { tagId: 'tag-pink' } },
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
        themeId: 'blue-gray',
        spacing: {
          horizontal: 48,
          vertical: 8
        },
        defaultShape: 'plain',
        defaultEdgeStyle: {
          width: 2,
          lineType: 'solid',
          color: '#64748b'
        },
        tags: [
          { id: 'tag-blue', name: 'Blue', color: '#3b82f6' },
          { id: 'tag-pink', name: 'Pending', color: '#ec4899' },
          { id: 'tag-green', name: 'Done', color: '#22c55e' },
          { id: 'tag-orange', name: 'Orange', color: '#f97316' }
        ]
      },
      checklist: {
        checkedNodeIds: []
      }
    },
    ui: {
      layoutDirection: 'horizontal',
      nodeOffsetsByDirection: { horizontal: {}, vertical: {} },
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} },
      toolbarVisible: true
    }
  };
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

test('outline checklist state persists after save and reopen', async ({}, testInfo) => {
  const filePath = await writeFixture(testInfo, 'checklist-persist.qflow', JSON.stringify(createChecklistFixture()));
  const first = await launchWithOpenPath(filePath);

  await triggerMenuAction(first.app, 'file:open');
  await expect(first.window.getByTestId('outline-check-n1')).toBeVisible();
  await expect(first.window.getByTestId('outline-check-n2')).toBeVisible();
  await expect(first.window.getByTestId('outline-node-n3')).toContainText('Second task [Pending]');
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
