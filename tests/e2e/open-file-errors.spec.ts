import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

async function writeFixture(testInfo: { outputPath: (path: string) => string }, name: string, content: string) {
  const filePath = testInfo.outputPath(name);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

async function launchWithOpenPath(filePath: string) {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: filePath
    }
  });
  const window = await app.firstWindow();
  await expect(window.getByTestId('node-n1')).toBeVisible();
  return { app, window };
}

async function triggerOpen(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => {
    const targetWindow = BrowserWindow.getAllWindows()[0];
    targetWindow.webContents.send('flowmaptool:menuAction', 'file:open');
  });
}

test('shows a readable error for invalid JSON files', async ({}, testInfo) => {
  const filePath = await writeFixture(testInfo, 'bad-json.qflow', '{ bad json');
  const { app, window } = await launchWithOpenPath(filePath);

  await triggerOpen(app);
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

  await triggerOpen(app);
  await expect(window.getByTestId('file-status')).toContainText('newer Flowmaptool version');
  await expect(window.getByTestId('node-n1')).toHaveCount(1);

  await app.close();
});

test('shows a readable error for non Flowmaptool JSON files', async ({}, testInfo) => {
  const filePath = await writeFixture(testInfo, 'wrong-shape.qflow', JSON.stringify({ name: 'not a graph' }));
  const { app, window } = await launchWithOpenPath(filePath);

  await triggerOpen(app);
  await expect(window.getByTestId('file-status')).toContainText('not a Flowmaptool document');
  await expect(window.getByTestId('node-n1')).toHaveCount(1);

  await app.close();
});

test('shows a readable error for incomplete Flowmaptool-shaped JSON files', async ({}, testInfo) => {
  const filePath = await writeFixture(testInfo, 'incomplete.qflow', JSON.stringify({ schemaVersion: 1 }));
  const { app, window } = await launchWithOpenPath(filePath);

  await triggerOpen(app);
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

  await triggerOpen(app);
  await expect(window.getByTestId('node-n1')).toContainText('Legacy Root');
  await expect(window.getByTestId('node-n8')).toContainText('Legacy Child');

  await app.close();
});
