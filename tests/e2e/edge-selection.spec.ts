import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('select and delete only one edge', async () => {
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
  await createChild('n2');

  await connectByHandle('n1', 'n3');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(3);

  await window.getByTestId('edge-path-e2').click({ force: true });
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await window.keyboard.press('Delete');

  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(2);
  await expect(window.locator('[data-testid^="node-"]')).toHaveCount(3);
  await app.close();
});

test('large back edge does not block selecting inner layout edges', async () => {
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
  const clickPathAt = async (edgeId: string, ratio: number) => {
    const point = await window.getByTestId(`edge-path-${edgeId}`).evaluate((path, pathRatio) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error('path matrix not found');
      const pointOnPath = svgPath.getPointAtLength(svgPath.getTotalLength() * pathRatio);
      const screenPoint = pointOnPath.matrixTransform(matrix);
      return { x: screenPoint.x, y: screenPoint.y };
    }, ratio);
    await window.mouse.move(point.x, point.y);
    await window.mouse.down();
    await window.mouse.up();
  };

  await createChild('n1');
  await createChild('n1');
  await createChild('n2');
  await createChild('n2');
  await createChild('n3');
  await createChild('n3');
  await connectByHandle('n4', 'n1');

  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(7);
  await clickPathAt('e3', 0.45);
  await expect(window.getByTestId('edge-path-e3')).toHaveClass(/edge-path-selected/);
  await clickPathAt('e1', 0.55);
  await expect(window.getByTestId('edge-path-e1')).toHaveClass(/edge-path-selected/);

  await app.close();
});
