import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

async function createChild(window: Page, parentId: string) {
  const parent = window.getByTestId(`node-${parentId}`);
  await parent.click();
  await expect(parent).toHaveClass(/flow-node-selected/);
  await window.keyboard.press('Tab');
  await window.keyboard.press('Escape');
}

async function readBoxes(window: Page, nodeIds: string[]) {
  const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const nodeId of nodeIds) {
    const box = await window.getByTestId(`node-${nodeId}`).boundingBox();
    if (!box) throw new Error(`node-${nodeId} missing`);
    boxes.set(nodeId, box);
  }
  return boxes;
}

function expectBoxesStable(
  before: Map<string, { x: number; y: number; width: number; height: number }>,
  after: Map<string, { x: number; y: number; width: number; height: number }>
) {
  for (const [nodeId, beforeBox] of before) {
    const afterBox = after.get(nodeId);
    if (!afterBox) throw new Error(`${nodeId} missing after interaction`);
    expect(Math.abs(afterBox.x - beforeBox.x), `${nodeId} x changed`).toBeLessThanOrEqual(2);
    expect(Math.abs(afterBox.y - beforeBox.y), `${nodeId} y changed`).toBeLessThanOrEqual(2);
    expect(Math.abs(afterBox.width - beforeBox.width), `${nodeId} width changed`).toBeLessThanOrEqual(2);
    expect(Math.abs(afterBox.height - beforeBox.height), `${nodeId} height changed`).toBeLessThanOrEqual(2);
  }
}

test('clicking child after root drag keeps the moved component stable', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();

  await createChild(window, 'n1');
  await createChild(window, 'n1');
  await createChild(window, 'n2');
  await createChild(window, 'n2');
  await createChild(window, 'n3');

  const root = window.getByTestId('node-n1');
  const rootBox = await root.boundingBox();
  if (!rootBox) throw new Error('root node missing');

  await window.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(rootBox.x + rootBox.width / 2 + 180, rootBox.y + rootBox.height / 2 + 90, { steps: 8 });
  await window.mouse.up();

  const nodeIds = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
  const beforeClick = await readBoxes(window, nodeIds);

  await window.getByTestId('node-n4').click();
  await expect(window.getByTestId('node-n4')).toHaveClass(/flow-node-selected/);
  expectBoxesStable(beforeClick, await readBoxes(window, nodeIds));

  await window.getByTestId('node-n2').click();
  await expect(window.getByTestId('node-n2')).toHaveClass(/flow-node-selected/);
  expectBoxesStable(beforeClick, await readBoxes(window, nodeIds));

  await app.close();
});
