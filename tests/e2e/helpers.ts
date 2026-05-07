import { _electron as electron, type ElectronApplication, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { addEdge, addNode, createEmptyDoc, type FlowDoc } from '../../src/shared/graph';
import type { PersistedQflowFile, PersistedUiState } from '../../src/renderer/src/persistence';

type LaunchedApp = {
  app: ElectronApplication;
  window: Page;
};

type DefaultDocFixtureOverrides = Partial<Omit<FlowDoc, 'schemaVersion' | 'settings' | 'checklist'>> & {
  settings?: Partial<FlowDoc['settings']>;
  checklist?: Partial<FlowDoc['checklist']>;
  ui?: Partial<PersistedUiState>;
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
  fixture: FlowDoc | PersistedQflowFile
): Promise<LaunchedApp & { filePath: string }> {
  const filePath = await writeFixture(testInfo, name, JSON.stringify(fixture, null, 2));
  const launched = await launchApp({ FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: filePath });
  await launched.window.getByTestId('node-n1').waitFor({ state: 'visible' });
  return { ...launched, filePath };
}

export function createDefaultDocFixture(overrides: DefaultDocFixtureOverrides = {}): PersistedQflowFile {
  const { ui, settings, checklist, ...docOverrides } = overrides;
  let doc = createEmptyDoc();
  doc = addNode(doc, 'Root Topic');
  doc = addNode(doc, 'First task');
  doc = addNode(doc, 'Second task', { tagId: 'tag-pink' });
  doc = addEdge(doc, 'n1', 'n2');
  doc = addEdge(doc, 'n2', 'n3');

  return {
    schemaVersion: 1,
    doc: {
      ...doc,
      ...docOverrides,
      settings: {
        ...doc.settings,
        ...settings,
        spacing: {
          ...doc.settings.spacing,
          ...settings?.spacing
        },
        defaultEdgeStyle: {
          ...doc.settings.defaultEdgeStyle,
          ...settings?.defaultEdgeStyle
        },
        tags: settings?.tags || doc.settings.tags
      },
      checklist: {
        ...doc.checklist,
        ...checklist
      }
    },
    ui: {
      layoutDirection: 'horizontal',
      nodeOffsetsByDirection: { horizontal: {}, vertical: {} },
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} },
      toolbarVisible: true,
      taskTable: {
        filters: {},
        visibleColumnKeys: [
          'task',
          'status',
          'category',
          'priority',
          'progress',
          'assignee',
          'start',
          'due',
          'tag',
          'notes'
        ],
        columnWidths: {},
        expanded: false,
        view: 'all'
      },
      ...ui
    }
  };
}

export async function renameSelectedNode(window: Page, label: string) {
  await window.keyboard.press('Space');
  const labelInput = window.locator('.node-label-input');
  await labelInput.fill(label);
  await labelInput.press('Enter');
}

export async function renameNode(window: Page, nodeId: string, label: string) {
  await window.getByTestId(`node-${nodeId}`).click();
  await renameSelectedNode(window, label);
}

export async function addChildNode(window: Page) {
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
}

export async function addChild(window: Page, parentId: string) {
  const parent = window.getByTestId(`node-${parentId}`);
  await parent.click();
  await addChildNode(window);
}

export async function applyTag(window: Page, nodeId: string, tagName: string) {
  await window.getByTestId(`node-${nodeId}`).click();
  await window.getByLabel(`Apply tag ${tagName}`).click();
}

export async function triggerMenuAction(app: ElectronApplication, action: string) {
  await app.evaluate(({ BrowserWindow }, menuAction) => {
    const targetWindow = BrowserWindow.getAllWindows()[0];
    targetWindow.webContents.send('flowmaptool:menuAction', menuAction);
  }, action);
}
