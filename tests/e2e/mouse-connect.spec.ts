import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('dragging connect handle creates a manual edge', async () => {
  const mainEntry = join(process.cwd(), 'out', 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry] });
  const window = await app.firstWindow();
  const edgePathLocator = window.locator('[data-testid^="edge-path-"]');
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
  await expect(edgePathLocator).toHaveCount(2);

  const rootNode = window.getByTestId('node-n1');
  const rootHandle = rootNode.locator('.node-connect-handle');
  await expect(rootHandle).toHaveCSS('opacity', '0');
  const rootBox = await rootNode.boundingBox();
  if (!rootBox) throw new Error('root node not found');
  await window.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2);
  await expect(rootHandle).toHaveCSS('opacity', '1');
  await window.mouse.move(rootBox.x - 40, rootBox.y - 40);
  await expect(rootHandle).toHaveCSS('opacity', '0');

  await connectByHandle('n1', 'n3');
  await expect(edgePathLocator).toHaveCount(3);
  await app.close();
});
