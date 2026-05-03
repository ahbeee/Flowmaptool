import { expect, test } from '@playwright/test';
import { launchApp, triggerMenuAction, writeFixture } from './helpers';

async function launchWithOpenPath(filePath: string) {
  const { app, window } = await launchApp({ FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: filePath });
  await expect(window.getByTestId('node-n1')).toBeVisible();
  return { app, window };
}

test('shows a readable error for invalid JSON files', async ({}, testInfo) => {
  const filePath = await writeFixture(testInfo, 'bad-json.qflow', '{ bad json');
  const { app, window } = await launchWithOpenPath(filePath);

  await triggerMenuAction(app, 'file:open');
  await expect(window.getByTestId('file-status')).toContainText('not valid JSON');
  await expect(window.getByTestId('node-n1')).toHaveCount(1);

  await app.close();
});

test('shows a readable error for unsupported future files', async ({}, testInfo) => {
  const filePath = await writeFixture(
    testInfo,
    'future.qflow',
    JSON.stringify({
      schemaVersion: 999,
      doc: {
        schemaVersion: 999,
        nodes: [],
        edges: [],
        meta: { nextNodeSeq: 1, nextEdgeSeq: 1 }
      }
    })
  );
  const { app, window } = await launchWithOpenPath(filePath);

  await triggerMenuAction(app, 'file:open');
  await expect(window.getByTestId('file-status')).toContainText('newer Flowmaptool version');
  await expect(window.getByTestId('node-n1')).toHaveCount(1);

  await app.close();
});

test('shows a readable error for non Flowmaptool JSON files', async ({}, testInfo) => {
  const filePath = await writeFixture(testInfo, 'wrong-shape.qflow', JSON.stringify({ name: 'not a graph' }));
  const { app, window } = await launchWithOpenPath(filePath);

  await triggerMenuAction(app, 'file:open');
  await expect(window.getByTestId('file-status')).toContainText('not a Flowmaptool document');
  await expect(window.getByTestId('node-n1')).toHaveCount(1);

  await app.close();
});

test('shows a readable error for incomplete Flowmaptool-shaped JSON files', async ({}, testInfo) => {
  const filePath = await writeFixture(testInfo, 'incomplete.qflow', JSON.stringify({ schemaVersion: 1 }));
  const { app, window } = await launchWithOpenPath(filePath);

  await triggerMenuAction(app, 'file:open');
  await expect(window.getByTestId('file-status')).toContainText('not a Flowmaptool document');
  await expect(window.getByTestId('node-n1')).toHaveCount(1);

  await app.close();
});

test('opens legacy files without schemaVersion', async ({}, testInfo) => {
  const filePath = await writeFixture(
    testInfo,
    'legacy.qflow',
    JSON.stringify({
      nodes: [{ label: 'Legacy Root' }, { id: 'n8', label: 'Legacy Child' }],
      edges: [{ from: 'n1', to: 'n8' }]
    })
  );
  const { app, window } = await launchWithOpenPath(filePath);

  await triggerMenuAction(app, 'file:open');
  await expect(window.getByTestId('node-n1')).toContainText('Legacy Root');
  await expect(window.getByTestId('node-n8')).toContainText('Legacy Child');

  await app.close();
});
