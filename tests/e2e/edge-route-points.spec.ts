import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

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

  await window.getByRole('button', { name: 'Add Route Point' }).click();
  await expect(window.locator('.edge-bend-handle')).toHaveCount(2);
  await expect(window.locator('.edge-bend-handle-selected')).toHaveCount(1);
  await window.keyboard.press('Delete');
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect(window.getByTestId('edge-path-e2')).toBeVisible();

  await window.getByRole('button', { name: 'Add Route Point' }).click();
  await expect(window.locator('.edge-bend-handle')).toHaveCount(2);

  const beforeDrag = await edgePathD();
  const center = await handleCenter(1);
  await window.mouse.move(center.x, center.y);
  await window.mouse.down();
  await window.mouse.move(center.x + 30, center.y + 60);
  await window.mouse.up();

  await expect.poll(edgePathD).not.toBe(beforeDrag);
  await window.getByRole('button', { name: 'Reset Bend' }).click();
  await expect(window.locator('.edge-bend-handle')).toHaveCount(1);
  await expect.poll(edgePathD).toBe(automaticPath);

  await app.close();
});
