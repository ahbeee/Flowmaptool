import { _electron as electron, type ElectronApplication, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FlowDoc } from '../../src/shared/graph';

type LaunchedApp = {
  app: ElectronApplication;
  window: Page;
};

export const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');

export async function launchApp(env?: Record<string, string>): Promise<LaunchedApp> {
  const baseEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      baseEnv[key] = value;
    }
  }
  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...baseEnv,
      ...env
    }
  });
  const window = await app.firstWindow();
  return { app, window };
}

export async function writeFixture(testInfo: Pick<TestInfo, 'outputPath'>, name: string, content: string) {
  const filePath = testInfo.outputPath(name);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function launchAppWithFixture(
  testInfo: Pick<TestInfo, 'outputPath'>,
  name: string,
  doc: FlowDoc
): Promise<LaunchedApp & { filePath: string }> {
  const filePath = await writeFixture(testInfo, name, JSON.stringify(doc, null, 2));
  const launched = await launchApp({ FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: filePath });
  return { ...launched, filePath };
}

export async function renameSelectedNode(window: Page, label: string) {
  await window.keyboard.press('Space');
  const labelInput = window.locator('.node-label-input');
  await labelInput.fill(label);
  await labelInput.press('Enter');
}

export async function addChildNode(window: Page) {
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
}

export async function triggerMenuAction(app: ElectronApplication, action: string) {
  await app.evaluate(({ BrowserWindow }, menuAction) => {
    const targetWindow = BrowserWindow.getAllWindows()[0];
    targetWindow.webContents.send('flowmaptool:menuAction', menuAction);
  }, action);
}
