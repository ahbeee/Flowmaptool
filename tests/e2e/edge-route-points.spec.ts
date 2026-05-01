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

function createEndpointOffsetFixture() {
  const settings = {
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
  };

  return {
    schemaVersion: 1,
    doc: {
      schemaVersion: 1,
      nodes: [
        { id: 'n1', label: 'Root' },
        { id: 'n2', label: '1' },
        { id: 'n3', label: '3' },
        { id: 'n4', label: '7' },
        { id: 'n5', label: '9' },
        { id: 'n6', label: '2' },
        { id: 'n7', label: '5' },
        { id: 'n8', label: '8' }
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', role: 'layout' },
        { id: 'e2', from: 'n2', to: 'n3', role: 'layout' },
        { id: 'e3', from: 'n3', to: 'n4', role: 'layout' },
        { id: 'e4', from: 'n4', to: 'n5', role: 'layout' },
        { id: 'e5', from: 'n4', to: 'n2', role: 'manual', anchors: { from: 'back', to: 'front' } },
        { id: 'e6', from: 'n1', to: 'n6', role: 'layout' },
        { id: 'e7', from: 'n6', to: 'n7', role: 'layout' },
        { id: 'e8', from: 'n7', to: 'n8', role: 'layout' },
        { id: 'e9', from: 'n8', to: 'n6', role: 'manual', anchors: { from: 'front', to: 'back' } }
      ],
      meta: {
        nextNodeSeq: 9,
        nextEdgeSeq: 10
      },
      settings
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

function createDuplicatedBackEdgeFixture(includeManualEdges = true) {
  const settings = {
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
  };
  const nodes = [
    { id: 'n1', label: 'Root' },
    { id: 'n2', label: '1' },
    { id: 'n3', label: '2' },
    { id: 'n4', label: '3' },
    { id: 'n5', label: '4' },
    { id: 'n6', label: '5' },
    { id: 'n7', label: '6' },
    { id: 'n8', label: '7' },
    { id: 'n9', label: '8' },
    { id: 'n10', label: 'Root' },
    { id: 'n11', label: '1' },
    { id: 'n12', label: '2' },
    { id: 'n13', label: '3' },
    { id: 'n14', label: '4' },
    { id: 'n15', label: '5' },
    { id: 'n16', label: '6' },
    { id: 'n17', label: '7' },
    { id: 'n18', label: '8' }
  ];
  const layoutEdges = [
    ['e1', 'n1', 'n2'],
    ['e2', 'n1', 'n3'],
    ['e3', 'n2', 'n4'],
    ['e4', 'n2', 'n5'],
    ['e5', 'n3', 'n6'],
    ['e6', 'n3', 'n7'],
    ['e7', 'n4', 'n8'],
    ['e8', 'n6', 'n9'],
    ['e9', 'n10', 'n11'],
    ['e10', 'n10', 'n12'],
    ['e11', 'n11', 'n13'],
    ['e12', 'n11', 'n14'],
    ['e13', 'n12', 'n15'],
    ['e14', 'n12', 'n16'],
    ['e15', 'n13', 'n17'],
    ['e16', 'n15', 'n18']
  ].map(([id, from, to]) => ({ id, from, to, role: 'layout' }));
  const manualEdges = [
    {
      id: 'e17',
      from: 'n17',
      to: 'n10',
      role: 'manual',
      anchors: { from: 'back', to: 'front' }
    },
    {
      id: 'e18',
      from: 'n18',
      to: 'n10',
      role: 'manual',
      anchors: { from: 'back', to: 'front' }
    }
  ];
  const bottomOffsets = Object.fromEntries(
    nodes
      .filter(node => Number(node.id.slice(1)) >= 10)
      .map(node => [node.id, { x: 0, y: 360 }])
  );

  return {
    schemaVersion: 1,
    doc: {
      schemaVersion: 1,
      nodes,
      edges: includeManualEdges ? [...layoutEdges, ...manualEdges] : layoutEdges,
      meta: {
        nextNodeSeq: 19,
        nextEdgeSeq: includeManualEdges ? 19 : 17
      },
      settings
    },
    ui: {
      layoutDirection: 'horizontal',
      nodeOffsetsByDirection: {
        horizontal: bottomOffsets,
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

test('dragging a back-edge control preserves source and target anchor sides', async () => {
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
    await handle.dragTo(target, { force: true });
  };

  const expectAnchorDirections = async () => {
    const directions = await window.getByTestId('edge-path-e7').evaluate((path: SVGPathElement) => {
      const matrix = path.getScreenCTM();
      const source = document.querySelector('[data-testid="node-n4"]');
      const target = document.querySelector('[data-testid="node-n1"]');
      if (!matrix || !(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        throw new Error('missing edge geometry');
      }
      const total = path.getTotalLength();
      const start = path.getPointAtLength(0).matrixTransform(matrix);
      const afterStart = path.getPointAtLength(Math.min(16, total * 0.08)).matrixTransform(matrix);
      const beforeEnd = path.getPointAtLength(Math.max(0, total - Math.min(16, total * 0.08))).matrixTransform(matrix);
      const end = path.getPointAtLength(total).matrixTransform(matrix);
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      return {
        startsAtSourceBack: Math.abs(start.x - sourceRect.right) <= 5,
        exitsSourceBack: afterStart.x >= start.x - 1,
        endsAtTargetFront: Math.abs(end.x - targetRect.left) <= 5,
        entersTargetFront: beforeEnd.x <= end.x + 1
      };
    });
    expect(directions.startsAtSourceBack).toBe(true);
    expect(directions.exitsSourceBack).toBe(true);
    expect(directions.endsAtTargetFront).toBe(true);
    expect(directions.entersTargetFront).toBe(true);
  };

  await createChild('n1');
  await createChild('n1');
  await createChild('n2');
  await createChild('n2');
  await createChild('n3');
  await createChild('n3');
  await connectByHandle('n4', 'n1');
  await expect(window.getByTestId('edge-path-e7')).toBeVisible();
  await expectAnchorDirections();

  const edgePath = window.getByTestId('edge-path-e7');
  const selectPoint = await edgePath.evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const point = path.getPointAtLength(path.getTotalLength() * 0.5).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
  await window.mouse.click(selectPoint.x, selectPoint.y);
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  const handleBox = await window.locator('.edge-bend-handle').boundingBox();
  if (!handleBox) throw new Error('manual route control handle not found');
  await window.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(handleBox.x + handleBox.width / 2 + 32, handleBox.y + handleBox.height / 2 + 120, {
    steps: 10
  });
  await window.mouse.up();

  await expectAnchorDirections();
  await app.close();
});

test('duplicated component back edges stay scoped after moving copied root', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('duplicated-back-edge.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createDuplicatedBackEdgeFixture(), null, 2), 'utf-8');

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
  await expect(window.getByTestId('edge-path-e17')).toBeVisible();
  await expect(window.getByTestId('edge-path-e18')).toBeVisible();

  const topRootBox = await window.getByTestId('node-n1').boundingBox();
  const bottomRoot = window.getByTestId('node-n10');
  const bottomRootBox = await bottomRoot.boundingBox();
  if (!topRootBox || !bottomRootBox) throw new Error('expected both roots to be measurable');

  await window.mouse.move(
    bottomRootBox.x + bottomRootBox.width / 2,
    bottomRootBox.y + bottomRootBox.height / 2
  );
  await window.mouse.down();
  await window.mouse.move(
    bottomRootBox.x + bottomRootBox.width / 2 - 120,
    bottomRootBox.y + bottomRootBox.height / 2 + 40,
    { steps: 10 }
  );
  await window.mouse.up();

  const movedBottomRootBox = await bottomRoot.boundingBox();
  if (!movedBottomRootBox) throw new Error('expected moved copied root to be measurable');
  const topRootMidY = topRootBox.y + topRootBox.height / 2;
  const bottomRootMidY = movedBottomRootBox.y + movedBottomRootBox.height / 2;

  for (const edgeId of ['e17', 'e18']) {
    const routeBox = await window.getByTestId(`edge-path-${edgeId}`).boundingBox();
    if (!routeBox) throw new Error(`expected ${edgeId} route to be measurable`);
    const routeMidY = routeBox.y + routeBox.height / 2;
    expect(Math.abs(routeMidY - bottomRootMidY)).toBeLessThan(Math.abs(routeMidY - topRootMidY));
    expect(routeBox.y).toBeGreaterThan(topRootBox.y + topRootBox.height);
  }

  await app.close();
});

test('duplicated component back edges created by handle drag stay scoped after moving copied root', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('duplicated-back-edge-ui-connect.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createDuplicatedBackEdgeFixture(false), null, 2), 'utf-8');

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

  const connectByHandle = async (fromId: string, toId: string) => {
    const sourceNode = window.getByTestId(`node-${fromId}`);
    const handle = sourceNode.locator('.node-connect-handle');
    const target = window.getByTestId(`node-${toId}`);
    const sourceBox = await sourceNode.boundingBox();
    if (!sourceBox) throw new Error(`source node ${fromId} not found`);
    await window.mouse.move(sourceBox.x + sourceBox.width - 2, sourceBox.y + sourceBox.height / 2);
    await handle.dragTo(target, { force: true });
  };

  await connectByHandle('n17', 'n10');
  await connectByHandle('n18', 'n10');
  await expect(window.getByTestId('edge-path-e17')).toBeVisible();
  await expect(window.getByTestId('edge-path-e18')).toBeVisible();

  const topRootBox = await window.getByTestId('node-n1').boundingBox();
  const bottomRoot = window.getByTestId('node-n10');
  const bottomRootBox = await bottomRoot.boundingBox();
  if (!topRootBox || !bottomRootBox) throw new Error('expected both roots to be measurable');

  await window.mouse.move(
    bottomRootBox.x + bottomRootBox.width / 2,
    bottomRootBox.y + bottomRootBox.height / 2
  );
  await window.mouse.down();
  await window.mouse.move(
    bottomRootBox.x + bottomRootBox.width / 2 - 120,
    bottomRootBox.y + bottomRootBox.height / 2 + 40,
    { steps: 10 }
  );
  await window.mouse.up();

  const movedBottomRootBox = await bottomRoot.boundingBox();
  if (!movedBottomRootBox) throw new Error('expected moved copied root to be measurable');
  const topRootMidY = topRootBox.y + topRootBox.height / 2;
  const bottomRootMidY = movedBottomRootBox.y + movedBottomRootBox.height / 2;

  for (const edgeId of ['e17', 'e18']) {
    const routeBox = await window.getByTestId(`edge-path-${edgeId}`).boundingBox();
    if (!routeBox) throw new Error(`expected ${edgeId} route to be measurable`);
    const routeMidY = routeBox.y + routeBox.height / 2;
    expect(Math.abs(routeMidY - bottomRootMidY)).toBeLessThan(Math.abs(routeMidY - topRootMidY));
    expect(routeBox.y).toBeGreaterThan(topRootBox.y + topRootBox.height);
  }

  await app.close();
});

test('adjusted copied component back edge moves with copied root', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('duplicated-adjusted-back-edge.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createDuplicatedBackEdgeFixture(false), null, 2), 'utf-8');

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

  const connectByHandle = async (fromId: string, toId: string) => {
    const sourceNode = window.getByTestId(`node-${fromId}`);
    const handle = sourceNode.locator('.node-connect-handle');
    const target = window.getByTestId(`node-${toId}`);
    const sourceBox = await sourceNode.boundingBox();
    if (!sourceBox) throw new Error(`source node ${fromId} not found`);
    await window.mouse.move(sourceBox.x + sourceBox.width - 2, sourceBox.y + sourceBox.height / 2);
    await handle.dragTo(target, { force: true });
  };

  await connectByHandle('n17', 'n10');
  await expect(window.getByTestId('edge-path-e17')).toBeVisible();

  const edgePath = window.getByTestId('edge-path-e17');
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
  await window.mouse.move(handleBox.x + handleBox.width / 2 + 84, handleBox.y + handleBox.height / 2 + 48, {
    steps: 8
  });
  await window.mouse.up();

  const adjustedPath = await edgePath.getAttribute('d');
  expect(adjustedPath).toBeTruthy();
  const routeBoxBeforeMove = await edgePath.boundingBox();
  const topRootBox = await window.getByTestId('node-n1').boundingBox();
  const bottomRoot = window.getByTestId('node-n10');
  const bottomRootBox = await bottomRoot.boundingBox();
  if (!routeBoxBeforeMove || !topRootBox || !bottomRootBox) {
    throw new Error('expected adjusted route and roots to be measurable');
  }

  await window.mouse.move(
    bottomRootBox.x + bottomRootBox.width / 2,
    bottomRootBox.y + bottomRootBox.height / 2
  );
  await window.mouse.down();
  await window.mouse.move(
    bottomRootBox.x + bottomRootBox.width / 2 - 118,
    bottomRootBox.y + bottomRootBox.height / 2 + 42,
    { steps: 10 }
  );
  await window.mouse.up();

  const movedBottomRootBox = await bottomRoot.boundingBox();
  const routeBoxAfterMove = await edgePath.boundingBox();
  if (!movedBottomRootBox || !routeBoxAfterMove) {
    throw new Error('expected adjusted route and moved copied root to remain measurable');
  }
  const rootDelta = {
    x: movedBottomRootBox.x - bottomRootBox.x,
    y: movedBottomRootBox.y - bottomRootBox.y
  };
  const routeDelta = {
    x: routeBoxAfterMove.x - routeBoxBeforeMove.x,
    y: routeBoxAfterMove.y - routeBoxBeforeMove.y
  };
  expect(Math.abs(routeDelta.x - rootDelta.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(routeDelta.y - rootDelta.y)).toBeLessThanOrEqual(3);

  const topRootMidY = topRootBox.y + topRootBox.height / 2;
  const bottomRootMidY = movedBottomRootBox.y + movedBottomRootBox.height / 2;
  const routeMidY = routeBoxAfterMove.y + routeBoxAfterMove.height / 2;
  expect(Math.abs(routeMidY - bottomRootMidY)).toBeLessThan(Math.abs(routeMidY - topRootMidY));

  await app.close();
});

test('copied component back edges ignore unrelated root moves', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('duplicated-back-edge-unrelated-root.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createDuplicatedBackEdgeFixture(), null, 2), 'utf-8');

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
  await expect(window.getByTestId('edge-path-e17')).toBeVisible();
  await expect(window.getByTestId('edge-path-e18')).toBeVisible();

  const edgeSnapshot = async (edgeId: string) => {
    const path = window.getByTestId(`edge-path-${edgeId}`);
    const d = await path.getAttribute('d');
    const box = await path.boundingBox();
    if (!d || !box) throw new Error(`expected ${edgeId} route to be measurable`);
    return { d, box };
  };

  const before = {
    e17: await edgeSnapshot('e17'),
    e18: await edgeSnapshot('e18')
  };
  const bottomRootBoxBefore = await window.getByTestId('node-n10').boundingBox();
  const topRoot = window.getByTestId('node-n1');
  const topRootBox = await topRoot.boundingBox();
  if (!topRootBox || !bottomRootBoxBefore) throw new Error('expected both roots to be measurable');

  await window.mouse.move(topRootBox.x + topRootBox.width / 2, topRootBox.y + topRootBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(topRootBox.x + topRootBox.width / 2 + 112, topRootBox.y + topRootBox.height / 2 - 36, {
    steps: 10
  });
  await window.mouse.up();

  const bottomRootBoxAfter = await window.getByTestId('node-n10').boundingBox();
  if (!bottomRootBoxAfter) throw new Error('expected copied root to remain measurable');
  expect(bottomRootBoxAfter.x).toBeCloseTo(bottomRootBoxBefore.x, 0);
  expect(bottomRootBoxAfter.y).toBeCloseTo(bottomRootBoxBefore.y, 0);

  for (const edgeId of ['e17', 'e18'] as const) {
    const after = await edgeSnapshot(edgeId);
    expect(after.d).toBe(before[edgeId].d);
    expect(after.box.x).toBeCloseTo(before[edgeId].box.x, 0);
    expect(after.box.y).toBeCloseTo(before[edgeId].box.y, 0);
    expect(after.box.width).toBeCloseTo(before[edgeId].box.width, 0);
    expect(after.box.height).toBeCloseTo(before[edgeId].box.height, 0);
  }

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
    const target = window.getByTestId(`node-${toId}`);
    const sourceBox = await sourceNode.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error(`nodes ${fromId} and ${toId} must be measurable`);
    await window.mouse.move(sourceBox.x + sourceBox.width - 1, sourceBox.y + sourceBox.height / 2);
    await window.mouse.down();
    await window.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 8
    });
    await window.mouse.up();
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
  const rootBoxBeforeMove = await root.boundingBox();
  if (!routeBoxBeforeMove || !rootBoxBeforeMove) throw new Error('expected root and manual route to be measurable');
  await window.mouse.move(rootBoxBeforeMove.x + rootBoxBeforeMove.width / 2, rootBoxBeforeMove.y + rootBoxBeforeMove.height / 2);
  await window.mouse.down();
  await window.mouse.move(rootBoxBeforeMove.x + rootBoxBeforeMove.width / 2 + 96, rootBoxBeforeMove.y + rootBoxBeforeMove.height / 2 + 64, {
    steps: 8
  });
  await window.mouse.up();

  const rootBoxAfterMove = await root.boundingBox();
  const routeBoxAfterMove = await edgePath.boundingBox();
  if (!routeBoxAfterMove || !rootBoxAfterMove) throw new Error('expected root and manual route to remain measurable after root move');
  const rootDelta = {
    x: rootBoxAfterMove.x - rootBoxBeforeMove.x,
    y: rootBoxAfterMove.y - rootBoxBeforeMove.y
  };
  const routeDelta = {
    x: routeBoxAfterMove.x - routeBoxBeforeMove.x,
    y: routeBoxAfterMove.y - routeBoxBeforeMove.y
  };
  expect(routeDelta.x).toBeCloseTo(rootDelta.x, 0);
  expect(routeDelta.y).toBeCloseTo(rootDelta.y, 0);

  await app.close();
});

test('rejected non-root drag restores adjusted manual route state', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('manual-route-single-node-drag.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createManualRouteFixture(), null, 2), 'utf-8');

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

  const edgePath = window.getByTestId('edge-path-e3');
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
  await window.mouse.move(handleBox.x + handleBox.width / 2 + 72, handleBox.y + handleBox.height / 2 - 44, {
    steps: 8
  });
  await window.mouse.up();

  const adjustedPath = await edgePath.getAttribute('d');
  expect(adjustedPath).toBeTruthy();

  const node = window.getByTestId('node-n3');
  const nodeBox = await node.boundingBox();
  if (!nodeBox) throw new Error('node n3 not found');
  await window.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(nodeBox.x + nodeBox.width / 2 + 180, nodeBox.y + nodeBox.height / 2 + 120, {
    steps: 8
  });
  await window.mouse.up();

  await expect.poll(() => edgePath.getAttribute('d')).toBe(adjustedPath);
  await app.close();
});

test('dragged manual route endpoint turns follow document spacing', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('endpoint-offset-route.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createEndpointOffsetFixture(), null, 2), 'utf-8');

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

  const dragRouteControl = async (edgeId: string, deltaY: number) => {
    const edgePath = window.getByTestId(`edge-path-${edgeId}`);
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
    if (!handleBox) throw new Error(`manual route control handle for ${edgeId} not found`);
    await window.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await window.mouse.down();
    await window.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + deltaY, {
      steps: 8
    });
    await window.mouse.up();
  };

  const firstTurnX = async (edgeId: string) => window.getByTestId(`edge-path-${edgeId}`).evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const total = path.getTotalLength();
    const start = path.getPointAtLength(0).matrixTransform(matrix);
    for (let distance = 1; distance <= total; distance += 2) {
      const point = path.getPointAtLength(distance).matrixTransform(matrix);
      if (Math.abs(point.y - start.y) > 3) return point.x;
    }
    return start.x;
  });

  await dragRouteControl('e5', -96);
  const n4Box = await window.getByTestId('node-n4').boundingBox();
  if (!n4Box) throw new Error('expected source node to be measurable');
  const halfHorizontalGap = 24;
  const turnTolerance = 16;
  const sourceBackTurnX = n4Box.x + n4Box.width + halfHorizontalGap;
  await expect.poll(() => firstTurnX('e5')).toBeGreaterThan(sourceBackTurnX - turnTolerance);
  await expect.poll(() => firstTurnX('e5')).toBeLessThan(sourceBackTurnX + turnTolerance);

  await dragRouteControl('e9', 96);
  const n8Box = await window.getByTestId('node-n8').boundingBox();
  if (!n8Box) throw new Error('expected source node to be measurable');
  const sourceFrontTurnX = n8Box.x - halfHorizontalGap;
  await expect.poll(() => firstTurnX('e9')).toBeGreaterThan(sourceFrontTurnX - turnTolerance);
  await expect.poll(() => firstTurnX('e9')).toBeLessThan(sourceFrontTurnX + turnTolerance);

  await app.close();
});

test('automatic back edge lanes use half of vertical spacing', async ({}, testInfo) => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const fixturePath = testInfo.outputPath('automatic-lane-spacing.qflow');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(createEndpointOffsetFixture(), null, 2), 'utf-8');

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

  const sourceBox = await window.getByTestId('node-n4').boundingBox();
  if (!sourceBox) throw new Error('expected source node to be measurable');
  const pathBox = await window.getByTestId('edge-path-e5').evaluate((path: SVGPathElement) => {
    const rect = path.getBoundingClientRect();
    return { top: rect.top };
  });

  const halfVerticalGap = 24;
  const laneTolerance = 8;
  await expect.poll(() => Promise.resolve(sourceBox.y - pathBox.top)).toBeGreaterThan(halfVerticalGap - laneTolerance);
  await expect.poll(() => Promise.resolve(sourceBox.y - pathBox.top)).toBeLessThan(halfVerticalGap + laneTolerance);

  await app.close();
});
