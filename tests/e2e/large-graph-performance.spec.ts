import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type FixtureNode = {
  id: string;
  label: string;
};

type FixtureEdge = {
  id: string;
  from: string;
  to: string;
};

function createLargeGraphFixture(nodeCount: number, edgeCount: number) {
  const nodes: FixtureNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index + 1}`,
    label: index === 0 ? 'Root Topic' : `Node ${index + 1}`
  }));
  const edges: FixtureEdge[] = [];
  const pairs = new Set<string>();

  const addEdge = (from: string, to: string) => {
    if (from === to || edges.length >= edgeCount) return;
    const key = `${from}->${to}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    edges.push({ id: `e${edges.length + 1}`, from, to });
  };

  for (let index = 2; index <= nodeCount; index++) {
    addEdge(`n${Math.floor(index / 2)}`, `n${index}`);
  }

  for (let offset = 1; edges.length < edgeCount && offset < nodeCount; offset++) {
    for (let fromIndex = 1; fromIndex <= nodeCount && edges.length < edgeCount; fromIndex++) {
      const toIndex = ((fromIndex + offset * 17 - 1) % nodeCount) + 1;
      addEdge(`n${fromIndex}`, `n${toIndex}`);
    }
  }

  return {
    schemaVersion: 1,
    doc: {
      schemaVersion: 1,
      nodes,
      edges,
      meta: {
        nextNodeSeq: nodeCount + 1,
        nextEdgeSeq: edgeCount + 1
      },
      settings: {
        themeId: 'blue-gray',
        spacing: {
          horizontal: 48,
          vertical: 24
        },
        defaultShape: 'plain',
        tags: [
          { id: 'tag-blue', name: 'Blue', color: '#3b82f6' },
          { id: 'tag-pink', name: 'Pending', color: '#ec4899' },
          { id: 'tag-green', name: 'Done', color: '#22c55e' },
          { id: 'tag-orange', name: 'Orange', color: '#f97316' }
        ]
      }
    },
    ui: {
      layoutDirection: 'horizontal',
      nodeOffsetsByDirection: { horizontal: {}, vertical: {} },
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      toolbarVisible: true
    }
  };
}

test('loads and remains responsive with 500 nodes and 1000 edges', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('large-graph.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createLargeGraphFixture(500, 1000)), 'utf-8');

  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: fixturePath
    }
  });
  const window = await app.firstWindow();
  await expect(window.getByTestId('node-n1')).toBeVisible();

  const started = Date.now();
  await app.evaluate(({ BrowserWindow }) => {
    const targetWindow = BrowserWindow.getAllWindows()[0];
    targetWindow.webContents.send('flowmaptool:menuAction', 'file:open');
  });
  await expect(window.getByTestId('node-n500')).toBeAttached({ timeout: 20_000 });
  const loadMs = Date.now() - started;

  expect(loadMs).toBeLessThan(20_000);
  await expect(window.locator('.flow-node')).toHaveCount(500);
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(1000);

  await window.getByTestId('node-n1').click();
  await expect(window.getByTestId('node-n1')).toHaveClass(/flow-node-selected/);

  await app.close();
});
