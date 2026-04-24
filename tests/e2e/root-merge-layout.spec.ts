import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('connecting secondary root to root merges subtree layout toward primary root', async () => {
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

  // Root(n1) -> A(n2), A -> B(n3), A -> C(n4)
  await createChild('n1');
  await createChild('n2');
  await createChild('n2');

  // Create second root D(n5), with children E(n6), F(n7)
  await window.keyboard.press('Control+C');
  await window.keyboard.press('Control+V');
  await window.keyboard.press('Escape');
  await createChild('n5');
  await createChild('n5');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(5);

  const dBefore = await window.getByTestId('node-n5').boundingBox();
  const rootBefore = await window.getByTestId('node-n1').boundingBox();
  if (!dBefore || !rootBefore) throw new Error('missing root boxes before merge');

  // D -> Root (should normalize to Root -> D)
  await window.getByTestId('node-n5').click();
  await window.getByTestId('node-n1').click({ modifiers: ['Shift'] });

  const dAfter = await window.getByTestId('node-n5').boundingBox();
  const rootAfter = await window.getByTestId('node-n1').boundingBox();
  if (!dAfter || !rootAfter) throw new Error('missing root boxes after merge');

  // D should move into the primary root flow: still to right of root, and much closer than before.
  expect(dAfter.x).toBeGreaterThan(rootAfter.x + 20);
  const distBefore = Math.abs(dBefore.y - rootBefore.y);
  const distAfter = Math.abs(dAfter.y - rootAfter.y);
  expect(distAfter).toBeLessThan(distBefore);

  await app.close();
});

test('right-drag connect to root also merges subtree layout', async () => {
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
  await createChild('n2');
  await window.keyboard.press('Control+C');
  await window.keyboard.press('Control+V');
  await window.keyboard.press('Escape');
  await createChild('n5');
  await createChild('n5');

  const dBefore = await window.getByTestId('node-n5').boundingBox();
  const rootBefore = await window.getByTestId('node-n1').boundingBox();
  if (!dBefore || !rootBefore) throw new Error('missing root boxes before merge');

  await connectByHandle('n5', 'n1');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(6);

  const dAfter = await window.getByTestId('node-n5').boundingBox();
  const rootAfter = await window.getByTestId('node-n1').boundingBox();
  if (!dAfter || !rootAfter) throw new Error('missing root boxes after merge');

  expect(dAfter.x).toBeGreaterThan(rootAfter.x + 20);
  const distBefore = Math.abs(dBefore.y - rootBefore.y);
  const distAfter = Math.abs(dAfter.y - rootAfter.y);
  expect(distAfter).toBeLessThan(distBefore);

  await app.close();
});
