import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

test('manual back edge routes around nodes without reflowing layout', async () => {
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
    const handle = window.getByTestId(`node-${fromId}`).locator('.node-connect-handle');
    const target = await window.getByTestId(`node-${toId}`).boundingBox();
    const from = await handle.boundingBox();
    if (!from || !target) throw new Error('connect points not found');
    await window.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await window.mouse.down({ button: 'right' });
    await window.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await window.mouse.up({ button: 'right' });
  };

  await createChild('n1');
  await createChild('n1');
  await createChild('n2');
  await createChild('n2');
  await createChild('n3');
  await createChild('n3');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(6);

  const before = new Map<string, { x: number; y: number }>();
  for (const id of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    if (!box) throw new Error(`missing node ${id}`);
    before.set(id, { x: box.x, y: box.y });
  }

  await connectByHandle('n7', 'n2');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(7);

  for (const id of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    const oldBox = before.get(id);
    if (!box || !oldBox) throw new Error(`missing node after route ${id}`);
    expect(Math.abs(box.x - oldBox.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y - oldBox.y)).toBeLessThanOrEqual(2);
  }

  const intersectsNonEndpointNode = await window.getByTestId('edge-path-e7').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const boxes = Array.from(document.querySelectorAll('[data-testid^="node-"]'))
      .filter(element => element.getAttribute('data-testid') !== 'node-n7' && element.getAttribute('data-testid') !== 'node-n2')
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left + 6,
          right: rect.right - 6,
          top: rect.top + 6,
          bottom: rect.bottom - 6
        };
      });
    const totalLength = path.getTotalLength();
    for (let distance = totalLength * 0.08; distance <= totalLength * 0.92; distance += 12) {
      const point = path.getPointAtLength(distance).matrixTransform(matrix);
      if (boxes.some(box => point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom)) {
        return true;
      }
    }
    return false;
  });
  expect(intersectsNonEndpointNode).toBe(false);

  await app.close();
});

test('nearby manual back edges use separate automatic lanes', async () => {
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
    const handle = window.getByTestId(`node-${fromId}`).locator('.node-connect-handle');
    const target = await window.getByTestId(`node-${toId}`).boundingBox();
    const from = await handle.boundingBox();
    if (!from || !target) throw new Error('connect points not found');
    await window.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await window.mouse.down({ button: 'right' });
    await window.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await window.mouse.up({ button: 'right' });
  };

  await createChild('n1');
  await createChild('n1');
  await createChild('n2');
  await createChild('n2');
  await createChild('n3');
  await createChild('n3');

  await connectByHandle('n7', 'n2');
  await connectByHandle('n7', 'n3');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(8);

  const firstRoute = await window.getByTestId('edge-path-e7').getAttribute('d');
  const secondRoute = await window.getByTestId('edge-path-e8').getAttribute('d');
  expect(firstRoute).toBeTruthy();
  expect(secondRoute).toBeTruthy();
  expect(secondRoute).not.toBe(firstRoute);

  await app.close();
});

test('multiple forward manual incoming edges share an orthogonal converge route', async () => {
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
  await createChild('n4');
  await createChild('n8');
  await createChild('n8');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(9);

  await connectByHandle('n5', 'n8');
  await connectByHandle('n6', 'n8');
  await connectByHandle('n7', 'n8');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(12);

  const commonTrunkX = await window.evaluate(() => {
    const routes = ['e10', 'e11', 'e12'].map(edgeId => {
      const path = document.querySelector(`[data-testid="edge-path-${edgeId}"]`);
      if (!(path instanceof SVGPathElement)) throw new Error(`missing path ${edgeId}`);
      const numbers = (path.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
      const pairs: { x: number; y: number }[] = [];
      for (let index = 0; index < numbers.length - 1; index += 2) {
        pairs.push({ x: numbers[index], y: numbers[index + 1] });
      }
      const xRanges = new Map<number, { minY: number; maxY: number; count: number }>();
      for (const pair of pairs) {
        const roundedX = Math.round(pair.x);
        const range = xRanges.get(roundedX) || { minY: pair.y, maxY: pair.y, count: 0 };
        range.minY = Math.min(range.minY, pair.y);
        range.maxY = Math.max(range.maxY, pair.y);
        range.count += 1;
        xRanges.set(roundedX, range);
      }
      return [...xRanges.entries()]
        .filter(([, range]) => range.count >= 2 && range.maxY - range.minY >= 18)
        .map(([x]) => x);
    });

    return routes[0].find(x => routes.every(route => route.includes(x))) || null;
  });

  expect(commonTrunkX).not.toBeNull();

  await app.close();
});

test('reverse manual connections preserve source and target direction', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');

  const buildBaseTree = async () => {
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

    return { app, window, connectByHandle };
  };

  const firstCase = await buildBaseTree();
  await firstCase.connectByHandle('n7', 'n4');
  await expect(firstCase.window.locator('[data-testid^="edge-path-"]')).toHaveCount(7);
  const n7ToN4Path = await firstCase.window.getByTestId('edge-path-e7').getAttribute('d');
  const n7ToN4Anchors = await firstCase.window.getByTestId('edge-path-e7').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    const source = document.querySelector('[data-testid="node-n7"]');
    const target = document.querySelector('[data-testid="node-n4"]');
    if (!matrix || !(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error('missing screen geometry');
    }
    const start = path.getPointAtLength(0).matrixTransform(matrix);
    const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return {
      startsAtSourceBack: Math.abs(start.x - sourceRect.right) <= 4,
      endsAtTargetFront: Math.abs(end.x - targetRect.left) <= 4
    };
  });
  expect(n7ToN4Anchors.startsAtSourceBack).toBe(true);
  expect(n7ToN4Anchors.endsAtTargetFront).toBe(true);
  await firstCase.app.close();

  const secondCase = await buildBaseTree();
  await secondCase.connectByHandle('n4', 'n7');
  await expect(secondCase.window.locator('[data-testid^="edge-path-"]')).toHaveCount(7);
  const n4ToN7Path = await secondCase.window.getByTestId('edge-path-e7').getAttribute('d');
  const n4ToN7Anchors = await secondCase.window.getByTestId('edge-path-e7').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    const source = document.querySelector('[data-testid="node-n4"]');
    const target = document.querySelector('[data-testid="node-n7"]');
    if (!matrix || !(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error('missing screen geometry');
    }
    const start = path.getPointAtLength(0).matrixTransform(matrix);
    const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return {
      startsAtSourceBack: Math.abs(start.x - sourceRect.right) <= 4,
      endsAtTargetFront: Math.abs(end.x - targetRect.left) <= 4
    };
  });
  expect(n4ToN7Anchors.startsAtSourceBack).toBe(true);
  expect(n4ToN7Anchors.endsAtTargetFront).toBe(true);
  expect(n7ToN4Path).toBeTruthy();
  expect(n4ToN7Path).toBeTruthy();
  expect(n4ToN7Path).not.toBe(n7ToN4Path);
  await secondCase.app.close();
});

test('selecting nodes does not mutate automatic manual routes', async () => {
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

  const routePath = () => window.getByTestId('edge-path-e7').getAttribute('d');
  const stableRoute = await routePath();
  await window.getByTestId('node-n4').click();
  await expect.poll(routePath).toBe(stableRoute);
  await window.getByTestId('node-n2').click();
  await expect.poll(routePath).toBe(stableRoute);
  await window.getByTestId('canvas-surface').click({ position: { x: 12, y: 12 } });
  await expect.poll(routePath).toBe(stableRoute);

  await app.close();
});

test('cross branch manual edge keeps existing layout stable', async () => {
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
    const source = await sourceNode.boundingBox();
    const target = await window.getByTestId(`node-${toId}`).boundingBox();
    if (!source || !target) throw new Error('connect points not found');
    await window.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await expect(handle).toHaveCSS('opacity', '1');
    await handle.dragTo(window.getByTestId(`node-${toId}`), { targetPosition: { x: target.width / 2, y: target.height / 2 } });
  };

  await createChild('n1');
  await createChild('n1');
  await createChild('n1');
  await createChild('n1');
  await createChild('n2');
  await createChild('n2');
  await createChild('n3');
  await createChild('n3');
  await createChild('n4');
  await createChild('n10');
  await createChild('n10');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(11);

  const nodeIds = Array.from({ length: 12 }, (_, index) => `n${index + 1}`);
  const before = new Map<string, { x: number; y: number }>();
  for (const id of nodeIds) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    if (!box) throw new Error(`missing node ${id}`);
    before.set(id, { x: box.x, y: box.y });
  }

  await connectByHandle('n12', 'n4');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(12);

  for (const id of nodeIds) {
    const box = await window.getByTestId(`node-${id}`).boundingBox();
    const oldBox = before.get(id);
    if (!box || !oldBox) throw new Error(`missing node after cross branch route ${id}`);
    expect(Math.abs(box.x - oldBox.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y - oldBox.y)).toBeLessThanOrEqual(2);
  }

  const route = await window.getByTestId('edge-path-e12').getAttribute('d');
  expect(route).toBeTruthy();
  expect(route).toContain('Q');

  await app.close();
});

test('cross branch manual edge avoids nodes and preserves nearby tree edge selection', async () => {
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

  const clickPathAt = async (edgeId: string, ratio: number) => {
    const point = await window.getByTestId(`edge-path-${edgeId}`).evaluate((path, pathRatio) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error('path matrix not found');
      const pointOnPath = svgPath.getPointAtLength(svgPath.getTotalLength() * pathRatio);
      const screenPoint = pointOnPath.matrixTransform(matrix);
      return { x: screenPoint.x, y: screenPoint.y };
    }, ratio);
    await window.mouse.click(point.x, point.y);
  };

  await createChild('n1');
  await createChild('n1');
  await createChild('n1');
  await createChild('n1');
  await createChild('n2');
  await createChild('n2');
  await createChild('n3');
  await createChild('n3');
  await createChild('n4');
  await createChild('n10');
  await createChild('n10');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(11);

  await connectByHandle('n12', 'n4');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(12);

  const intersectsNonEndpointNode = await window.getByTestId('edge-path-e12').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const boxes = Array.from(document.querySelectorAll('[data-testid^="node-"]'))
      .filter(element => element.getAttribute('data-testid') !== 'node-n12' && element.getAttribute('data-testid') !== 'node-n4')
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left + 6,
          right: rect.right - 6,
          top: rect.top + 6,
          bottom: rect.bottom - 6
        };
      });
    const totalLength = path.getTotalLength();
    for (let distance = totalLength * 0.08; distance <= totalLength * 0.92; distance += 10) {
      const point = path.getPointAtLength(distance).matrixTransform(matrix);
      if (boxes.some(box => point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom)) {
        return true;
      }
    }
    return false;
  });
  expect(intersectsNonEndpointNode).toBe(false);

  for (const edgeId of ['e1', 'e2', 'e3', 'e4']) {
    await clickPathAt(edgeId, 0.5);
    await expect(window.getByTestId(`edge-path-${edgeId}`)).toHaveClass(/edge-path-selected/);
    await expect(window.getByTestId('edge-path-e12')).not.toHaveClass(/edge-path-selected/);
  }

  await clickPathAt('e12', 0.5);
  await expect(window.getByTestId('edge-path-e12')).toHaveClass(/edge-path-selected/);

  await app.close();
});

test('long labels reflow descendants without breaking cross branch manual routes', async () => {
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
  await connectByHandle('n5', 'n6');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(7);

  await window.getByTestId('node-n3').click();
  await window.keyboard.press('Space');
  const labelInput = window.locator('.node-label-input');
  await expect(labelInput).toBeVisible();
  await labelInput.fill('Node 333333333333333333333333333333333');
  await labelInput.press('Enter');
  await expect(window.getByTestId('node-n3')).toContainText('Node 333333333333333333333333333333333');

  const geometry = await window.locator('[data-testid^="node-"]').evaluateAll(nodes =>
    nodes.map(node => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      return {
        id: element.getAttribute('data-testid') || '',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      };
    })
  );

  for (let i = 0; i < geometry.length; i++) {
    for (let j = i + 1; j < geometry.length; j++) {
      const a = geometry[i];
      const b = geometry[j];
      const overlaps =
        a.left < b.right - 2 &&
        a.right > b.left + 2 &&
        a.top < b.bottom - 2 &&
        a.bottom > b.top + 2;
      expect(overlaps, `${a.id} should not overlap ${b.id}`).toBe(false);
    }
  }

  const node3 = geometry.find(node => node.id === 'node-n3');
  const node6 = geometry.find(node => node.id === 'node-n6');
  const node7 = geometry.find(node => node.id === 'node-n7');
  if (!node3 || !node6 || !node7) throw new Error('missing reflow nodes');
  expect(node6.left - node3.right).toBeGreaterThanOrEqual(44);
  expect(node7.left - node3.right).toBeGreaterThanOrEqual(44);

  const intersectsNonEndpointNode = await window.getByTestId('edge-path-e7').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error('edge path screen matrix not found');
    const boxes = Array.from(document.querySelectorAll('[data-testid^="node-"]'))
      .filter(element => element.getAttribute('data-testid') !== 'node-n5' && element.getAttribute('data-testid') !== 'node-n6')
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left + 6,
          right: rect.right - 6,
          top: rect.top + 6,
          bottom: rect.bottom - 6
        };
      });
    const totalLength = path.getTotalLength();
    for (let distance = totalLength * 0.08; distance <= totalLength * 0.92; distance += 12) {
      const point = path.getPointAtLength(distance).matrixTransform(matrix);
      if (boxes.some(box => point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom)) {
        return true;
      }
    }
    return false;
  });
  expect(intersectsNonEndpointNode).toBe(false);

  await app.close();
});

test('front connect handle preserves source side intent', async () => {
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
  await createChild('n2');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);

  const root = window.getByTestId('node-n1');
  const frontHandle = root.locator('.node-connect-handle-front');
  const target = window.getByTestId('node-n4');
  await root.hover();
  await expect(frontHandle).toHaveCSS('opacity', '1');
  await expect(frontHandle).toHaveCSS('pointer-events', 'auto');
  const handleBox = await frontHandle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!handleBox) throw new Error('missing front handle');
  if (!targetBox) throw new Error('missing target node');
  await window.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await window.mouse.up();
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(4);

  const startsAtRootFront = await window.getByTestId('edge-path-e4').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    const rootNode = document.querySelector('[data-testid="node-n1"]');
    if (!matrix || !(rootNode instanceof HTMLElement)) return false;
    const start = path.getPointAtLength(0).matrixTransform(matrix);
    const rootRect = rootNode.getBoundingClientRect();
    return Math.abs(start.x - rootRect.left) <= 3;
  });
  expect(startsAtRootFront).toBe(true);
  const endsAtTargetFront = await window.getByTestId('edge-path-e4').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    const targetNode = document.querySelector('[data-testid="node-n4"]');
    if (!matrix || !(targetNode instanceof HTMLElement)) return false;
    const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
    const targetRect = targetNode.getBoundingClientRect();
    return Math.abs(end.x - targetRect.left) <= 3;
  });
  expect(endsAtTargetFront).toBe(true);

  await app.close();
});

test('front and back handles create directionally distinct manual routes', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');

  const buildBaseTree = async () => {
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
    await createChild('n2');
    await createChild('n2');
    return { app, window };
  };

  const backCase = await buildBaseTree();
  const node4BackHandle = backCase.window.getByTestId('node-n4').locator('.node-connect-handle');
  const rootNode = backCase.window.getByTestId('node-n1');
  await backCase.window.getByTestId('node-n4').hover();
  await expect(node4BackHandle).toHaveCSS('opacity', '1');
  await node4BackHandle.dragTo(rootNode);
  await expect(backCase.window.locator('[data-testid^="edge-path-"]')).toHaveCount(5);
  const backPath = await backCase.window.getByTestId('edge-path-e5').getAttribute('d');
  const backStartsAtNode4Back = await backCase.window.getByTestId('edge-path-e5').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    const node = document.querySelector('[data-testid="node-n4"]');
    if (!matrix || !(node instanceof HTMLElement)) return false;
    const start = path.getPointAtLength(0).matrixTransform(matrix);
    const rect = node.getBoundingClientRect();
    return Math.abs(start.x - rect.right) <= 4;
  });
  expect(backStartsAtNode4Back).toBe(true);
  await backCase.app.close();

  const frontCase = await buildBaseTree();
  const rootFrontHandle = frontCase.window.getByTestId('node-n1').locator('.node-connect-handle-front');
  const node4 = frontCase.window.getByTestId('node-n4');
  await frontCase.window.getByTestId('node-n1').hover();
  await expect(rootFrontHandle).toHaveCSS('opacity', '1');
  await rootFrontHandle.dragTo(node4);
  await expect(frontCase.window.locator('[data-testid^="edge-path-"]')).toHaveCount(5);
  const frontPath = await frontCase.window.getByTestId('edge-path-e5').getAttribute('d');
  const frontStartsAtRootFront = await frontCase.window.getByTestId('edge-path-e5').evaluate((path: SVGPathElement) => {
    const matrix = path.getScreenCTM();
    const node = document.querySelector('[data-testid="node-n1"]');
    if (!matrix || !(node instanceof HTMLElement)) return false;
    const start = path.getPointAtLength(0).matrixTransform(matrix);
    const rect = node.getBoundingClientRect();
    return Math.abs(start.x - rect.left) <= 4;
  });
  expect(frontStartsAtRootFront).toBe(true);
  expect(frontPath).toBeTruthy();
  expect(backPath).toBeTruthy();
  expect(frontPath).not.toBe(backPath);
  await frontCase.app.close();
});

test('opposite manual connections between the same nodes remain distinct and selectable', async () => {
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

  const clickPathAt = async (edgeId: string, ratio: number) => {
    const point = await window.getByTestId(`edge-path-${edgeId}`).evaluate((path, pathRatio) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error('path matrix not found');
      const pointOnPath = svgPath.getPointAtLength(svgPath.getTotalLength() * pathRatio);
      const screenPoint = pointOnPath.matrixTransform(matrix);
      return { x: screenPoint.x, y: screenPoint.y };
    }, ratio);
    await window.mouse.click(point.x, point.y);
  };

  await createChild('n1');
  await createChild('n2');

  const childBackHandle = window.getByTestId('node-n3').locator('.node-connect-handle');
  const rootNode = window.getByTestId('node-n1');
  await window.getByTestId('node-n3').hover();
  await expect(childBackHandle).toHaveCSS('opacity', '1');
  await childBackHandle.dragTo(rootNode);
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);

  const rootFrontHandle = rootNode.locator('.node-connect-handle-front');
  const childNode = window.getByTestId('node-n3');
  await rootNode.hover();
  await expect(rootFrontHandle).toHaveCSS('opacity', '1');
  await rootFrontHandle.dragTo(childNode);
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(4);

  const backPath = await window.getByTestId('edge-path-e3').getAttribute('d');
  const frontPath = await window.getByTestId('edge-path-e4').getAttribute('d');
  expect(backPath).toBeTruthy();
  expect(frontPath).toBeTruthy();
  expect(frontPath).not.toBe(backPath);

  await clickPathAt('e3', 0.5);
  await expect(window.getByTestId('edge-path-e3')).toHaveClass(/edge-path-selected/);
  await clickPathAt('e4', 0.5);
  await expect(window.getByTestId('edge-path-e4')).toHaveClass(/edge-path-selected/);

  await app.close();
});

test('large routed manual edge does not block selecting nearby layout edges', async () => {
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

  const connectByBackHandle = async (fromId: string, toId: string) => {
    const sourceNode = window.getByTestId(`node-${fromId}`);
    const handle = sourceNode.locator('.node-connect-handle');
    const target = window.getByTestId(`node-${toId}`);
    const sourceBox = await sourceNode.boundingBox();
    if (!sourceBox) throw new Error(`source node ${fromId} not found`);
    await window.mouse.move(sourceBox.x + sourceBox.width - 2, sourceBox.y + sourceBox.height / 2);
    await expect(handle).toHaveCSS('opacity', '1');
    await handle.dragTo(target);
  };

  const clickRenderedPathAt = async (edgeId: string, ratio: number) => {
    const point = await window.getByTestId(`edge-path-${edgeId}`).evaluate((path, pathRatio) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error('path matrix not found');
      const pointOnPath = svgPath.getPointAtLength(svgPath.getTotalLength() * pathRatio);
      const screenPoint = pointOnPath.matrixTransform(matrix);
      return { x: screenPoint.x, y: screenPoint.y };
    }, ratio);
    await window.mouse.click(point.x, point.y);
  };

  await createChild('n1');
  await createChild('n1');
  await createChild('n2');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);

  await connectByBackHandle('n4', 'n1');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(4);

  await clickRenderedPathAt('e1', 0.45);
  await expect(window.getByTestId('edge-path-e1')).toHaveClass(/edge-path-selected/);
  await expect(window.getByTestId('edge-path-e4')).not.toHaveClass(/edge-path-selected/);
  await clickRenderedPathAt('e2', 0.45);
  await expect(window.getByTestId('edge-path-e2')).toHaveClass(/edge-path-selected/);
  await expect(window.getByTestId('edge-path-e4')).not.toHaveClass(/edge-path-selected/);
  await clickRenderedPathAt('e3', 0.5);
  await expect(window.getByTestId('edge-path-e3')).toHaveClass(/edge-path-selected/);
  await expect(window.getByTestId('edge-path-e4')).not.toHaveClass(/edge-path-selected/);

  await app.close();
});

test('manual handle connections require opposite source and target sides', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');

  const openBaseTree = async () => {
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
    await createChild('n2');
    await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);
    return { app, window };
  };

  const dragBetweenHandles = async (
    window: Page,
    fromId: string,
    fromSelector: '.node-connect-handle' | '.node-connect-handle-front',
    toId: string,
    toSelector: '.node-connect-handle' | '.node-connect-handle-front'
  ) => {
    const sourceNode = window.getByTestId(`node-${fromId}`);
    const sourceHandle = sourceNode.locator(fromSelector);
    const targetHandle = window.getByTestId(`node-${toId}`).locator(toSelector);
    await sourceNode.hover();
    await expect(sourceHandle).toHaveCSS('opacity', '1');
    const targetBox = await targetHandle.boundingBox();
    if (!targetBox) throw new Error('handle geometry not found');
    await sourceHandle.dragTo(targetHandle, {
      targetPosition: { x: targetBox.width / 2, y: targetBox.height / 2 }
    });
  };

  const sameBack = await openBaseTree();
  await dragBetweenHandles(sameBack.window, 'n4', '.node-connect-handle', 'n1', '.node-connect-handle');
  await expect(sameBack.window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);
  await sameBack.app.close();

  const sameFront = await openBaseTree();
  await dragBetweenHandles(sameFront.window, 'n4', '.node-connect-handle-front', 'n1', '.node-connect-handle-front');
  await expect(sameFront.window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);
  await sameFront.app.close();

  const backToFront = await openBaseTree();
  await dragBetweenHandles(backToFront.window, 'n4', '.node-connect-handle', 'n1', '.node-connect-handle-front');
  await expect(backToFront.window.locator('[data-testid^="edge-path-"]')).toHaveCount(4);
  await backToFront.app.close();

  const frontToBack = await openBaseTree();
  await dragBetweenHandles(frontToBack.window, 'n1', '.node-connect-handle-front', 'n4', '.node-connect-handle');
  await expect(frontToBack.window.locator('[data-testid^="edge-path-"]')).toHaveCount(4);
  await frontToBack.app.close();
});
