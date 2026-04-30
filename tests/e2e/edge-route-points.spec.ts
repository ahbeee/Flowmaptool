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

test('selected edge supports multiple editable route points', async () => {
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

  const selectEdge = async (edgeId: string) => {
    await window.getByTestId(`edge-path-${edgeId}`).click({ force: true });
    await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  };

  const handleCenter = async (index: number) => {
    const box = await window.locator('.edge-bend-handle').nth(index).boundingBox();
    if (!box) throw new Error(`edge route handle ${index} not found`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const edgePathD = () => window.getByTestId('edge-path-e2').getAttribute('d');

  await createChild('n1');
  await createChild('n1');

  await selectEdge('e2');
  const automaticPath = await edgePathD();
  await window.getByRole('button', { name: 'Add Route Point' }).click();

  await expect(window.locator('.edge-bend-handle')).toHaveCount(2);
  await expect(window.locator('.edge-bend-handle-selected')).toHaveCount(1);
  await expect.poll(edgePathD).not.toBe(automaticPath);
  expect((await edgePathD())?.match(/\bL\b/g)?.length || 0).toBeGreaterThanOrEqual(3);

  await window.getByRole('button', { name: 'Delete Route Point' }).click();
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect(window.getByRole('button', { name: 'Delete Route Point' })).toBeDisabled();

  const edgePoint = await window.getByTestId('edge-path-e2').evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.25);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await window.mouse.dblclick(edgePoint.x, edgePoint.y);
  await expect(window.locator('.edge-bend-handle')).toHaveCount(2);
  await expect(window.locator('.edge-bend-handle-selected')).toHaveCount(1);
  await window.keyboard.press('Delete');
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect(window.getByTestId('edge-path-e2')).toBeVisible();

  const segmentDragPoint = await window.getByTestId('edge-path-e2').evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.15);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  const beforeSegmentDrag = await edgePathD();
  await window.mouse.move(segmentDragPoint.x, segmentDragPoint.y);
  await window.mouse.down();
  await window.mouse.move(segmentDragPoint.x + 36, segmentDragPoint.y + 44);
  await window.mouse.up();
  await expect(window.locator('.edge-bend-handle')).toHaveCount(2);
  await expect(window.locator('.edge-bend-handle-selected')).toHaveCount(1);
  await expect.poll(edgePathD).not.toBe(beforeSegmentDrag);
  await window.keyboard.press('Delete');
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);

  await window.getByRole('button', { name: 'Add Route Point' }).click();
  await expect(window.locator('.edge-bend-handle')).toHaveCount(2);
  await expect(window.locator('.edge-bend-handle-selected')).toHaveCount(1);
  await window.keyboard.press('Delete');
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect(window.getByTestId('edge-path-e2')).toBeVisible();

  await window.getByRole('button', { name: 'Add Route Point' }).click();
  await expect(window.locator('.edge-bend-handle')).toHaveCount(2);

  const beforeRightDrag = await edgePathD();
  const rightDragCenter = await handleCenter(1);
  await window.mouse.move(rightDragCenter.x, rightDragCenter.y);
  await window.mouse.down({ button: 'right' });
  await window.mouse.move(rightDragCenter.x + 24, rightDragCenter.y + 48, { steps: 6 });
  await expect(window.getByTestId('edge-route-drag-preview')).toHaveCount(0);
  await window.mouse.up({ button: 'right' });
  await expect.poll(edgePathD).toBe(beforeRightDrag);

  const beforeDrag = await edgePathD();
  const center = await handleCenter(1);
  await window.mouse.move(center.x, center.y);
  await window.mouse.down();
  await window.mouse.move(center.x + 30, center.y + 60);
  await window.mouse.up();

  await expect.poll(edgePathD).not.toBe(beforeDrag);

  const beforeSecondDrag = await edgePathD();
  const secondDragCenter = await handleCenter(1);
  await window.mouse.move(secondDragCenter.x, secondDragCenter.y);
  await window.mouse.down();
  await window.mouse.move(secondDragCenter.x + 20, secondDragCenter.y - 70);
  await expect(window.getByTestId('edge-route-drag-preview')).toBeVisible();
  await window.mouse.up();

  await expect.poll(edgePathD).not.toBe(beforeSecondDrag);
  await expect(window.getByTestId('edge-route-drag-preview')).toHaveCount(0);
  await expect(window.locator('.edge-bend-handle-selected')).toHaveCount(1);
  await window.getByRole('button', { name: 'Reset Bend' }).click();
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect.poll(edgePathD).toBe(automaticPath);

  await app.close();
});

test('selected automatic manual route exposes editable route points', async () => {
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
    await sourceNode.hover();
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

  const selectPoint = await window.getByTestId('edge-path-e7').evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.5);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await window.mouse.click(selectPoint.x, selectPoint.y);

  await expect.poll(() => window.locator('.edge-bend-handle').count()).toBeGreaterThan(1);
  await expect(window.getByTestId('edge-route-guide')).toBeVisible();
  const beforeDrag = await window.getByTestId('edge-path-e7').getAttribute('d');
  const handleBox = await window.locator('.edge-bend-handle').first().boundingBox();
  if (!handleBox) throw new Error('edge route handle not found');
  const center = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };

  await window.mouse.move(center.x, center.y);
  await window.mouse.down();
  await window.mouse.move(center.x + 40, center.y - 60, { steps: 8 });
  await expect(window.getByTestId('edge-route-drag-preview')).toBeVisible();
  await expect(window.getByTestId('edge-route-guide')).toHaveCount(0);
  await window.mouse.up();

  await expect.poll(() => window.getByTestId('edge-path-e7').getAttribute('d')).not.toBe(beforeDrag);
  await expect(window.getByTestId('edge-route-guide')).toBeVisible();
  await app.close();
});

test('manual route edits are saved and restored from qflow files', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('manual-route-persistence.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createManualRouteFixture(), null, 2), 'utf-8');

  const launchOpenedFixture = async () => {
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
    await expect(window.getByTestId('node-n3')).toBeVisible();
    await expect(window.getByTestId('edge-path-e3')).toBeVisible();
    return { app, window };
  };

  const firstRun = await launchOpenedFixture();
  const firstPath = firstRun.window.getByTestId('edge-path-e3');
  const selectPoint = await firstPath.evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.45);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await firstRun.window.mouse.click(selectPoint.x, selectPoint.y);
  await expect.poll(() => firstRun.window.locator('.edge-bend-handle').count()).toBeGreaterThan(1);

  const beforeEditPath = await firstPath.getAttribute('d');
  const handleBox = await firstRun.window.locator('.edge-bend-handle').first().boundingBox();
  if (!handleBox) throw new Error('edge route handle not found');
  const handleCenter = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
  await firstRun.window.mouse.move(handleCenter.x, handleCenter.y);
  await firstRun.window.mouse.down();
  await firstRun.window.mouse.move(handleCenter.x + 28, handleCenter.y - 70, { steps: 8 });
  await expect(firstRun.window.getByTestId('edge-route-drag-preview')).toBeVisible();
  await firstRun.window.mouse.up();

  await expect.poll(() => firstPath.getAttribute('d')).not.toBe(beforeEditPath);
  const editedPath = await firstPath.getAttribute('d');
  await triggerMenuAction(firstRun.app, 'file:save');
  await expect(firstRun.window.getByTestId('file-status')).toContainText('Saved:');
  await firstRun.app.close();

  const saved = JSON.parse(await readFile(fixturePath, 'utf-8')) as {
    ui?: { edgeRoutesByDirection?: { horizontal?: Record<string, { points?: unknown[] }> } };
  };
  expect(saved.ui?.edgeRoutesByDirection?.horizontal?.e3?.points?.length).toBeGreaterThan(1);

  const secondRun = await launchOpenedFixture();
  await expect.poll(() => secondRun.window.getByTestId('edge-path-e3').getAttribute('d')).toBe(editedPath);
  await secondRun.app.close();
});
