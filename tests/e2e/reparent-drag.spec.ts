import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

async function launchApp() {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();
  return { app, window };
}

async function createChild(window: Page, parentId: string) {
  const parent = window.getByTestId(`node-${parentId}`);
  await parent.click();
  await expect(parent).toHaveClass(/flow-node-selected/);
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
}

test('dragging a non-root node onto empty canvas restores auto layout', async () => {
  const { app, window } = await launchApp();

  await createChild(window, 'n1');
  const node = window.getByTestId('node-n2');
  const before = await node.boundingBox();
  if (!before) throw new Error('node-n2 not found');

  await window.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await window.mouse.down();
  await window.mouse.move(before.x + before.width + 220, before.y + before.height + 120);
  await window.mouse.up();

  const after = await node.boundingBox();
  if (!after) throw new Error('node-n2 missing after drag');
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);

  await app.close();
});

test('dragging a non-root node after root move restores moved component position', async () => {
  const { app, window } = await launchApp();

  await createChild(window, 'n1');
  const root = window.getByTestId('node-n1');
  const child = window.getByTestId('node-n2');
  const rootBefore = await root.boundingBox();
  if (!rootBefore) throw new Error('root node not found');

  await window.mouse.move(rootBefore.x + rootBefore.width / 2, rootBefore.y + rootBefore.height / 2);
  await window.mouse.down();
  await window.mouse.move(rootBefore.x + rootBefore.width / 2 + 180, rootBefore.y + rootBefore.height / 2 + 90);
  await window.mouse.up();

  const rootAfterMove = await root.boundingBox();
  const childAfterRootMove = await child.boundingBox();
  if (!rootAfterMove || !childAfterRootMove) throw new Error('nodes missing after root drag');

  await window.mouse.move(
    childAfterRootMove.x + childAfterRootMove.width / 2,
    childAfterRootMove.y + childAfterRootMove.height / 2
  );
  await window.mouse.down();
  await window.mouse.move(childAfterRootMove.x + childAfterRootMove.width + 220, childAfterRootMove.y + 140);
  await window.mouse.up();

  const rootAfterChildDrag = await root.boundingBox();
  const childAfterChildDrag = await child.boundingBox();
  if (!rootAfterChildDrag || !childAfterChildDrag) throw new Error('nodes missing after child drag');
  expect(Math.abs(rootAfterChildDrag.x - rootAfterMove.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(rootAfterChildDrag.y - rootAfterMove.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(childAfterChildDrag.x - childAfterRootMove.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(childAfterChildDrag.y - childAfterRootMove.y)).toBeLessThanOrEqual(2);

  await app.close();
});

test('dragging a non-root node onto another node after root move reparents without jumping', async () => {
  const { app, window } = await launchApp();

  await createChild(window, 'n1');
  await createChild(window, 'n1');
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(2);

  const root = window.getByTestId('node-n1');
  const target = window.getByTestId('node-n2');
  const moving = window.getByTestId('node-n3');
  const rootBefore = await root.boundingBox();
  if (!rootBefore) throw new Error('root node not found for drag test');

  await window.mouse.move(rootBefore.x + rootBefore.width / 2, rootBefore.y + rootBefore.height / 2);
  await window.mouse.down();
  await window.mouse.move(rootBefore.x + rootBefore.width / 2 + 160, rootBefore.y + rootBefore.height / 2 + 80);
  await window.mouse.up();

  const rootAfterMove = await root.boundingBox();
  const movingBox = await moving.boundingBox();
  const targetBox = await target.boundingBox();
  if (!rootAfterMove) throw new Error('root missing after move');
  if (!movingBox || !targetBox) throw new Error('nodes not found for drag test');

  await window.mouse.move(movingBox.x + movingBox.width / 2, movingBox.y + movingBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await expect(target).toHaveAttribute('data-drop-target', 'true');
  await window.mouse.up();

  const targetAfter = await target.boundingBox();
  const movingAfter = await moving.boundingBox();
  const rootAfterReparent = await root.boundingBox();
  if (!targetAfter || !movingAfter) throw new Error('nodes missing after reparent');
  if (!rootAfterReparent) throw new Error('root missing after reparent');
  expect(Math.abs(rootAfterReparent.x - rootAfterMove.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(rootAfterReparent.y - rootAfterMove.y)).toBeLessThanOrEqual(2);
  expect(movingAfter.x).toBeGreaterThan(targetAfter.x + targetAfter.width);
  expect(Math.abs(movingAfter.y - targetAfter.y)).toBeLessThanOrEqual(8);
  await expect(window.locator('[data-testid^="edge-path-"]')).toHaveCount(2);

  await app.close();
});
