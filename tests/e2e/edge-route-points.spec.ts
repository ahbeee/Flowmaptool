import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

async function triggerMenuAction(
  app: Awaited<ReturnType<typeof electron.launch>>,
  action: 'file:open' | 'file:save'
) {
  await app.evaluate(({ BrowserWindow }, menuAction) => {
    const targetWindow = BrowserWindow.getAllWindows()[0];
    targetWindow.webContents.send('flowmaptool:menuAction', menuAction);
  }, action);
}

function createManualRouteFixture() {
  return {
    schemaVersion: 1,
    doc: {
      schemaVersion: 1,
      nodes: [
        { id: 'n1', label: 'Root' },
        { id: 'n2', label: 'One' },
        { id: 'n3', label: 'Two' }
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', role: 'layout' },
        { id: 'e2', from: 'n1', to: 'n3', role: 'layout' },
        {
          id: 'e3',
          from: 'n3',
          to: 'n2',
          role: 'manual',
          anchors: { from: 'back', to: 'body' }
        }
      ],
      meta: {
        nextNodeSeq: 4,
        nextEdgeSeq: 4
      },
      settings: {
        themeId: 'blue-gray',
        spacing: {
          horizontal: 48,
          vertical: 48
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

function createDisconnectedBackEdgeFixture() {
  return {
    schemaVersion: 1,
    doc: {
      schemaVersion: 1,
      nodes: [
        { id: 'n1', label: 'Top Root' },
        { id: 'n2', label: 'Top Child' },
        { id: 'n3', label: 'Bottom Root' },
        { id: 'n4', label: 'Bottom Child' }
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', role: 'layout' },
        { id: 'e2', from: 'n3', to: 'n4', role: 'layout' },
        {
          id: 'e3',
          from: 'n4',
          to: 'n3',
          role: 'manual',
          anchors: { from: 'back', to: 'front' }
        }
      ],
      meta: {
        nextNodeSeq: 5,
        nextEdgeSeq: 4
      },
      settings: {
        themeId: 'blue-gray',
        spacing: {
          horizontal: 48,
          vertical: 48
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
      }
    },
    ui: {
      layoutDirection: 'horizontal',
      nodeOffsetsByDirection: {
        horizontal: {
          n3: { x: 0, y: 320 },
          n4: { x: 0, y: 320 }
        },
        vertical: {}
      },
      edgeBendsByDirection: { horizontal: {}, vertical: {} },
      edgeRoutesByDirection: { horizontal: {}, vertical: {} },
      toolbarVisible: true
    }
  };
}

test('edge segment drag keeps a clean routed bend without route point controls', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const createChild = async (parentId: string) => {
    const parent = window.getByTestId(`node-${parentId}`);
    await parent.click();
    await expect(parent).toHaveClass(/flow-node-selected/);
    await window.keyboard.press('Tab');
    await window.keyboard.press('Escape');
  };

  await createChild('n1');
  await createChild('n1');

  const edgePath = window.getByTestId('edge-path-e2');
  await edgePath.click({ force: true });
  await expect(window.getByRole('button', { name: 'Add Route Point' })).toHaveCount(0);
  await expect(window.getByRole('button', { name: 'Delete Route Point' })).toHaveCount(0);
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);

  const automaticPath = await edgePath.getAttribute('d');
  const dblClickPoint = await edgePath.evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.25);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await window.mouse.dblclick(dblClickPoint.x, dblClickPoint.y);
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect.poll(() => edgePath.getAttribute('d')).toBe(automaticPath);

  await window.mouse.move(dblClickPoint.x, dblClickPoint.y);
  await window.mouse.down();
  await window.mouse.move(dblClickPoint.x + 42, dblClickPoint.y + 54, { steps: 8 });
  await window.mouse.up();

  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect.poll(() => edgePath.getAttribute('d')).not.toBe(automaticPath);
  await expect.poll(() => edgePath.getAttribute('d')).toContain('L');
  const draggedPath = await edgePath.getAttribute('d');
  expect(draggedPath).toBeTruthy();
  expect((draggedPath?.match(/\bL\b/g) || []).length).toBeGreaterThanOrEqual(3);
  await window.getByRole('button', { name: 'Reset Bend' }).click();
  await expect.poll(() => edgePath.getAttribute('d')).toBe(automaticPath);

  await app.close();
});

test('automatic back edge route is scoped to its disconnected component after root move', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('disconnected-back-edge.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createDisconnectedBackEdgeFixture(), null, 2), 'utf-8');

  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: fixturePath
    }
  });
  const window = await app.firstWindow();
  await expect(window.getByTestId('node-n1')).toBeVisible();
  await triggerMenuAction(app, 'file:open');
  await expect(window.getByTestId('edge-path-e3')).toBeVisible();

  const bottomRoot = window.getByTestId('node-n3');
  const rootBox = await bottomRoot.boundingBox();
  if (!rootBox) throw new Error('bottom root node not found');
  await window.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(rootBox.x + rootBox.width / 2 - 90, rootBox.y + rootBox.height / 2 + 36, { steps: 8 });
  await window.mouse.up();

  const movedRootBox = await bottomRoot.boundingBox();
  const bottomChildBox = await window.getByTestId('node-n4').boundingBox();
  const topRootBox = await window.getByTestId('node-n1').boundingBox();
  const routeBox = await window.getByTestId('edge-path-e3').boundingBox();
  if (!movedRootBox || !bottomChildBox || !topRootBox || !routeBox) {
    throw new Error('expected route and node boxes to be measurable');
  }

  const bottomComponentTop = Math.min(movedRootBox.y, bottomChildBox.y);
  const bottomComponentBottom = Math.max(
    movedRootBox.y + movedRootBox.height,
    bottomChildBox.y + bottomChildBox.height
  );

  expect(routeBox.y).toBeGreaterThan(bottomComponentTop - 140);
  expect(routeBox.y + routeBox.height).toBeLessThan(bottomComponentBottom + 140);
  expect(routeBox.y).toBeGreaterThan(topRootBox.y + topRootBox.height);

  await app.close();
});

test('legacy route can be opened and reset without route point editing', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('legacy-route-to-bend.qflow');
  const fixture = createManualRouteFixture();
  fixture.ui.edgeRoutesByDirection.horizontal = {
    e3: {
      points: [
        { x: 220, y: 80 },
        { x: 280, y: 40 }
      ]
    }
  };
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(fixture, null, 2), 'utf-8');

  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: fixturePath
    }
  });
  const window = await app.firstWindow();
  await expect(window.getByTestId('node-n1')).toBeVisible();
  await triggerMenuAction(app, 'file:open');
  await expect(window.getByTestId('edge-path-e3')).toBeVisible();

  const edgePath = window.getByTestId('edge-path-e3');
  const selectPoint = await edgePath.evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.45);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await window.mouse.click(selectPoint.x, selectPoint.y);
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect(window.getByRole('button', { name: 'Add Route Point' })).toHaveCount(0);
  await expect(window.getByRole('button', { name: 'Delete Route Point' })).toHaveCount(0);

  const routedPath = await edgePath.getAttribute('d');
  const handleBox = await window.locator('.edge-bend-handle').boundingBox();
  if (!handleBox) throw new Error('legacy route control handle not found');
  await window.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(handleBox.x + handleBox.width / 2 + 48, handleBox.y + handleBox.height / 2 + 28, {
    steps: 6
  });
  await window.mouse.up();
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect.poll(() => edgePath.getAttribute('d')).not.toBe(routedPath);

  await window.getByRole('button', { name: 'Reset Bend' }).click();
  await triggerMenuAction(app, 'file:save');
  await expect(window.getByTestId('file-status')).toContainText('Saved:');
  await app.close();

  const saved = JSON.parse(await readFile(fixturePath, 'utf-8')) as {
    ui?: {
      edgeBendsByDirection?: { horizontal?: Record<string, unknown> };
      edgeRoutesByDirection?: { horizontal?: Record<string, unknown> };
    };
  };
  expect(saved.ui?.edgeBendsByDirection?.horizontal?.e3).toBeUndefined();
  expect(saved.ui?.edgeRoutesByDirection?.horizontal?.e3).toBeUndefined();
});

test('manual routed edge persists after save and reopen', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('manual-route-persist.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createManualRouteFixture(), null, 2), 'utf-8');

  const openFixture = async () => {
    const app = await electron.launch({
      args: [mainEntry],
      env: {
        ...process.env,
        FLOWMAPTOOL_TEST_OPEN_DOCUMENT_PATH: fixturePath
      }
    });
    const window = await app.firstWindow();
    await expect(window.getByTestId('node-n1')).toBeVisible();
    await triggerMenuAction(app, 'file:open');
    await expect(window.getByTestId('edge-path-e3')).toBeVisible();
    return { app, window };
  };

  const firstRun = await openFixture();
  const edgePath = firstRun.window.getByTestId('edge-path-e3');
  const selectPoint = await edgePath.evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.42);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await firstRun.window.mouse.click(selectPoint.x, selectPoint.y);
  await expect(firstRun.window.locator('.edge-bend-handle')).toHaveCount(1);

  const handleBox = await firstRun.window.locator('.edge-bend-handle').boundingBox();
  if (!handleBox) throw new Error('manual route control handle not found');
  await firstRun.window.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await firstRun.window.mouse.down();
  await firstRun.window.mouse.move(handleBox.x + handleBox.width / 2 + 72, handleBox.y + handleBox.height / 2 + 44, {
    steps: 8
  });
  await firstRun.window.mouse.up();

  const persistedPath = await edgePath.getAttribute('d');
  expect(persistedPath).toBeTruthy();
  await triggerMenuAction(firstRun.app, 'file:save');
  await expect(firstRun.window.getByTestId('file-status')).toContainText('Saved:');
  await firstRun.app.close();

  const saved = JSON.parse(await readFile(fixturePath, 'utf-8')) as {
    ui?: { edgeRoutesByDirection?: { horizontal?: Record<string, { points?: unknown[] }> } };
  };
  expect(saved.ui?.edgeRoutesByDirection?.horizontal?.e3?.points?.length).toBeGreaterThan(0);

  const secondRun = await openFixture();
  await expect.poll(() => secondRun.window.getByTestId('edge-path-e3').getAttribute('d')).toBe(persistedPath);
  await secondRun.app.close();
});

test('user adjusted manual route stays stable while selecting other objects', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  const createChild = async (parentId: string) => {
    const parent = window.getByTestId(`node-${parentId}`);
    await parent.click();
    await expect(parent).toHaveClass(/flow-node-selected/);
    await window.keyboard.press('Tab');
    await window.keyboard.press('Escape');
  };

  const connectByHandle = async (fromId: string, toId: string) => {
    const sourceNode = window.getByTestId(`node-${fromId}`);
    const handle = sourceNode.locator('.node-connect-handle');
    const target = window.getByTestId(`node-${toId}`);
    const sourceBox = await sourceNode.boundingBox();
    if (!sourceBox) throw new Error(`source node ${fromId} not found`);
    await window.mouse.move(sourceBox.x + sourceBox.width - 2, sourceBox.y + sourceBox.height / 2);
    await expect(handle).toHaveCSS('opacity', '1');
    await handle.dragTo(target);
  };

  await createChild('n1');
  await createChild('n1');
  await createChild('n2');
  await createChild('n2');
  await createChild('n3');
  await createChild('n3');
  await connectByHandle('n7', 'n2');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(7);

  const edgePath = window.getByTestId('edge-path-e7');
  const selectPoint = await edgePath.evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.5);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await window.mouse.click(selectPoint.x, selectPoint.y);
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);

  const handleBox = await window.locator('.edge-bend-handle').boundingBox();
  if (!handleBox) throw new Error('manual route control handle not found');
  await window.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(handleBox.x + handleBox.width / 2 + 64, handleBox.y + handleBox.height / 2 - 38, {
    steps: 8
  });
  await window.mouse.up();

  const adjustedPath = await edgePath.getAttribute('d');
  expect(adjustedPath).toBeTruthy();

  await window.getByTestId('node-n4').click();
  await expect.poll(() => edgePath.getAttribute('d')).toBe(adjustedPath);
  await window.getByTestId('node-n2').click();
  await expect.poll(() => edgePath.getAttribute('d')).toBe(adjustedPath);
  await window.getByTestId('canvas-surface').click({ position: { x: 16, y: 16 } });
  await expect.poll(() => edgePath.getAttribute('d')).toBe(adjustedPath);

  const routeBoxBeforeMove = await edgePath.boundingBox();
  const root = window.getByTestId('node-n1');
  const rootBox = await root.boundingBox();
  if (!routeBoxBeforeMove || !rootBox) throw new Error('expected root and manual route to be measurable');
  await window.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(rootBox.x + rootBox.width / 2 + 96, rootBox.y + rootBox.height / 2 + 64, {
    steps: 8
  });
  await window.mouse.up();

  const routeBoxAfterMove = await edgePath.boundingBox();
  if (!routeBoxAfterMove) throw new Error('expected manual route to remain measurable after root move');
  expect(routeBoxAfterMove.x).toBeGreaterThan(routeBoxBeforeMove.x + 30);

  await app.close();
});
